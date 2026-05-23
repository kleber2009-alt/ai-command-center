// Claude-driven daily digest for one Instagram DM thread. Mirrors the
// tg-agent digest architecture (tool-use → structured payload → rendered
// markdown card) — adapted for per-contact Instagram conversations.
//
// One generate() call ≈ 24h of one contact. The scheduler in
// `src/scheduler.ts` iterates every active contact every morning.

import Anthropic from '@anthropic-ai/sdk';

import type {
  ContactForDigest,
  DigestPayload,
  DigestRow,
  DigestStore,
  MessageForDigest,
} from './db/digests.js';
import type { Logger } from './logger.js';

// Soft cap: one contact's daily window. Instagram DMs are 1-on-1 and
// rarely cross 100 turns/day. If a single contact bursts past this we
// keep the oldest messages in the window (DB query ORDER BY ASC).
const MAX_MESSAGES_PER_DIGEST = 400;

const TOOL_NAME = 'report_ig_digest';

const digestTool: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Возвращает структурированную сводку по переписке в Instagram Direct. Все строки на русском.',
  input_schema: {
    type: 'object',
    properties: {
      gist: {
        type: 'string',
        description:
          '2-3 предложения по-русски: главная суть переписки за период. Что произошло, какое настроение, есть ли что-то срочное. Без воды.',
      },
      topics: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description: 'Темы, которые реально обсуждали. Короткими фразами.',
      },
      open_questions: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Вопросы собеседника, которые остались без ответа или с неполным ответом. Если есть, указывай автора: "@username — вопрос".',
      },
      decisions: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Что решили / о чём договорились / какие действия пообещали. Только реальные договорённости.',
      },
      follow_ups: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Что владельцу нужно сделать или ответить лично. Формат: "@username — причина" или просто действие.',
      },
      links: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Полезные ссылки или материалы, которыми поделились. Без рекламы и без ссылок-однодневок.',
      },
      blind_spots: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Что владелец легко может пропустить: тихие возражения, скрытое недовольство, оборванные нитки разговора, упоминания конкурентов, намёки на отток, тон, который может перерасти в проблему. Без панических преувеличений.',
      },
    },
    required: [
      'gist',
      'topics',
      'open_questions',
      'decisions',
      'follow_ups',
      'links',
      'blind_spots',
    ],
  },
};

const SYSTEM_PROMPT = `Ты — аналитик-помощник владельца Instagram-аккаунта. Твоя задача — прочитать журнал последних сообщений в одном DM-треде и составить честную, спокойную сводку, чтобы владелец понимал, что происходит, и не пропускал важное.

Правила:
- Пиши по-русски, простым человеческим языком. Не канцелярит, не маркетинг, не восклицания.
- Только факты из переданных сообщений. Не выдумывай решения, обещания и эмоции, которых не было.
- Если данных мало — короткие списки, можно пустые массивы. Лучше пустой раздел, чем выдуманный.
- Имя собеседника передавай как @username, если он есть; иначе по first_name; если ничего нет — "собеседник".
- Сообщения от роли "owner" — это сам владелец или его AI-агент. Сообщения от "user" — собеседник.
- Гист (gist) — 2-3 предложения, главное за период. Без формулы "сегодня обсуждали X, Y, Z".
- blind_spots — это твоя главная ценность. Тихие сигналы, которые легко проглядеть: возражения вполголоса, недосказанности, повторяющиеся жалобы, странный тон, упоминания конкурентов или альтернатив, обещания без ответа.
- Возвращай результат строго через инструмент report_ig_digest.`;

export interface DigestGeneratorOptions {
  apiKey: string;
  model: string;
}

export interface DigestGenerator {
  generate(input: GenerateInput): Promise<DigestPayload>;
}

export interface GenerateInput {
  contact: ContactForDigest;
  windowHours: number;
  messages: MessageForDigest[];
}

export function createDigestGenerator({
  apiKey,
  model,
}: DigestGeneratorOptions): DigestGenerator {
  const client = new Anthropic({ apiKey });

  return {
    async generate(input): Promise<DigestPayload> {
      const transcript = formatTranscript(input.messages, input.contact);
      const titleLine = `Собеседник: ${contactLabel(input.contact)}.`;
      const userBody = [
        titleLine,
        `Окно: последние ${input.windowHours} ч.`,
        '',
        `Журнал сообщений (${input.messages.length}):`,
        transcript,
      ].join('\n');

      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [digestTool],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: userBody }],
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === 'tool_use' && block.name === TOOL_NAME,
      );
      if (!toolUse) {
        throw new Error('Digest model did not return a tool_use block');
      }
      return parsePayload(toolUse.input);
    },
  };
}

function parsePayload(raw: unknown): DigestPayload {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Digest payload is not an object');
  }
  const obj = raw as Record<string, unknown>;
  const strArr = (key: string): string[] => {
    const v = obj[key];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  };
  const gist = typeof obj.gist === 'string' ? obj.gist.trim() : '';
  return {
    gist,
    topics: strArr('topics'),
    open_questions: strArr('open_questions'),
    decisions: strArr('decisions'),
    follow_ups: strArr('follow_ups'),
    links: strArr('links'),
    blind_spots: strArr('blind_spots'),
  };
}

function contactLabel(c: ContactForDigest): string {
  if (c.ig_username) return `@${c.ig_username}`;
  const fn = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return fn || `id ${c.id.slice(0, 8)}`;
}

function formatTranscript(
  messages: MessageForDigest[],
  contact: ContactForDigest,
): string {
  if (messages.length === 0) return '(пусто)';
  const userLabel = contactLabel(contact);
  return messages
    .map((m) => {
      const role = m.direction === 'incoming' ? userLabel : 'owner';
      const ts = m.created_at.slice(0, 16).replace('T', ' ');
      const text = m.text.replace(/\s+/g, ' ').trim();
      return `[${ts}] ${role}: ${text}`;
    })
    .join('\n');
}

// Render the structured payload into a Russian markdown digest. Same
// section ordering as tg-agent so the owner's eye lands in the same
// place no matter which inbox the digest came from.
export function renderSummary(
  payload: DigestPayload,
  meta: {
    contact: ContactForDigest;
    windowHours: number;
    messagesCount: number;
  },
): string {
  const lines: string[] = [];
  const title = contactLabel(meta.contact);
  lines.push(
    `🧠 Сводка по «${title}» · последние ${meta.windowHours}ч · ${meta.messagesCount} сообщений`,
  );
  lines.push('');
  if (payload.gist) {
    lines.push(payload.gist);
    lines.push('');
  }
  appendSection(lines, '📌 О чём говорили', payload.topics);
  appendSection(lines, '❓ Открытые вопросы', payload.open_questions);
  appendSection(lines, '✅ Решения и договорённости', payload.decisions);
  appendSection(lines, '👀 Кому стоит ответить лично', payload.follow_ups);
  appendSection(lines, '🔗 Полезные ссылки', payload.links);
  appendSection(lines, '⚠️ Что легко пропустить', payload.blind_spots);
  return lines.join('\n').trim();
}

function appendSection(lines: string[], header: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(header);
  for (const item of items) lines.push(`• ${item}`);
  lines.push('');
}

export interface BuildDigestDeps {
  store: DigestStore;
  generator: DigestGenerator;
  logger: Logger;
}

export interface BuildDigestInput {
  contact: ContactForDigest;
  windowHours: number;
}

export interface BuildDigestResult {
  digest: DigestRow | null;
  messagesCount: number;
  summaryMd: string;
  skippedReason: 'no_messages' | null;
}

// One-shot: pull messages → ask Claude → persist. Used both by the
// daily sweep and by manual POST /api/digests/run-now.
export async function buildDigest(
  deps: BuildDigestDeps,
  input: BuildDigestInput,
): Promise<BuildDigestResult> {
  const { store, generator, logger } = deps;
  const sinceIso = new Date(
    Date.now() - input.windowHours * 60 * 60 * 1000,
  ).toISOString();
  const messages = await store.listRecentMessages(
    input.contact.id,
    sinceIso,
    MAX_MESSAGES_PER_DIGEST,
  );

  if (messages.length === 0) {
    logger.info('ig-digest: no messages in window', {
      contactId: input.contact.id,
      windowHours: input.windowHours,
    });
    return {
      digest: null,
      messagesCount: 0,
      summaryMd: '',
      skippedReason: 'no_messages',
    };
  }

  const payload = await generator.generate({
    contact: input.contact,
    windowHours: input.windowHours,
    messages,
  });

  const summaryMd = renderSummary(payload, {
    contact: input.contact,
    windowHours: input.windowHours,
    messagesCount: messages.length,
  });

  const row = await store.saveDigest({
    contactId: input.contact.id,
    windowHours: input.windowHours,
    messagesCount: messages.length,
    payload,
    summaryMd,
  });

  logger.info('ig-digest: saved', {
    contactId: input.contact.id,
    digestId: row.id,
    chars: summaryMd.length,
  });

  return {
    digest: row,
    messagesCount: messages.length,
    summaryMd,
    skippedReason: null,
  };
}
