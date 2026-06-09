import Anthropic from '@anthropic-ai/sdk';
import { type Bot } from 'grammy';

import type { ChatService } from './db/chats.js';
import type { DigestPayload, DigestStore, MessageForDigest } from './db/digests.js';
import type { ForumRouter } from './forum.js';
import type { Logger } from './logger.js';

// Same TG hard limit as everywhere else — we split the DM if the
// rendered summary crosses 4000 (small headroom under the 4096 cap).
const TG_MAX_MESSAGE = 4000;

// How many messages to feed into one Claude call. Plenty for ~24h
// windows on the chats we host; if a chat is unusually busy we just
// keep the earliest ones in the window — see the DB query.
const MAX_MESSAGES_PER_DIGEST = 600;

const TOOL_NAME = 'report_digest';

// JSON schema for the structured payload Claude returns. Each array
// stays short (≤7) so the rendered DM fits in one Telegram message
// most of the time. The model decides what's worth listing —
// empty arrays are valid and common (a quiet chat has no decisions).
const digestTool: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Возвращает структурированную сводку по чату для владельца. Все строки на русском.',
  input_schema: {
    type: 'object',
    properties: {
      gist: {
        type: 'string',
        description:
          '2-3 предложения по-русски: главная суть периода. Что произошло, какое настроение, есть ли что-то срочное. Без воды.',
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
          'Вопросы участников, которые остались без ответа или с неполным ответом. Если есть, указывай автора: "@user — вопрос".',
      },
      decisions: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Что решили / о чём договорились / какие действия пообещали. Только реальные договорённости.',
      },
      project_signals: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Сигналы, важные для проектов владельца (см. project_context в промпте): спрос, обратная связь, идеи, риски, упоминания продуктов. Без выдумок — только то, что прямо звучало в чате.',
      },
      follow_ups: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 7,
        description:
          'Кому из участников владелец должен ответить лично. Формат: "@username — причина". Только если правда стоит ответить.',
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
      'project_signals',
      'follow_ups',
      'links',
      'blind_spots',
    ],
  },
};

const SYSTEM_PROMPT = `Ты — аналитик-помощник владельца Telegram-чатов. Твоя задача — прочитать журнал последних сообщений и составить честную, спокойную сводку, чтобы владелец понимал, что происходит в его чате, и не пропускал важное.

Правила:
- Пиши по-русски, простым человеческим языком. Не канцелярит, не маркетинг, не восклицания.
- Только факты из переданных сообщений. Не выдумывай решения, обещания и эмоции, которых не было.
- Если данных мало — короткие списки, можно пустые массивы. Лучше пустой раздел, чем выдуманный.
- Имена пользователей передавай как @username, если он есть; иначе по first_name; если ничего нет — "аноним".
- Гист (gist) — 2-3 предложения, главное за период. Без формулы "сегодня обсуждали X, Y, Z".
- blind_spots — это твоя главная ценность. Тихие сигналы, которые легко проглядеть: возражения вполголоса, недосказанности, повторяющиеся жалобы, странный тон, упоминания конкурентов или альтернатив, обещания без ответа.
- project_signals — только если в переданном project_context владелец описал свои проекты/продукты. Если контекст пустой — оставь массив пустым.
- Возвращай результат строго через инструмент report_digest.`;

export interface DigestGeneratorOptions {
  apiKey: string;
  model: string;
}

export interface DigestGenerator {
  generate(input: GenerateInput): Promise<DigestPayload>;
}

export interface GenerateInput {
  chatTitle: string | undefined;
  windowHours: number;
  projectContext: string;
  messages: MessageForDigest[];
}

export function createDigestGenerator({
  apiKey,
  model,
}: DigestGeneratorOptions): DigestGenerator {
  const client = new Anthropic({ apiKey });

  return {
    async generate(input): Promise<DigestPayload> {
      const transcript = formatTranscript(input.messages);
      const titleLine = input.chatTitle
        ? `Название чата: «${input.chatTitle}».`
        : 'Название чата неизвестно.';
      const ctx = input.projectContext.trim()
        ? input.projectContext.trim()
        : '(владелец не задал project_context)';

      const userBody = [
        titleLine,
        `Окно: последние ${input.windowHours} ч.`,
        '',
        'project_context (что важно владельцу):',
        ctx,
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
    project_signals: strArr('project_signals'),
    follow_ups: strArr('follow_ups'),
    links: strArr('links'),
    blind_spots: strArr('blind_spots'),
  };
}

function formatTranscript(messages: MessageForDigest[]): string {
  if (messages.length === 0) return '(пусто)';
  return messages
    .map((m) => {
      const who = m.username
        ? `@${m.username}`
        : (m.first_name?.trim() ||
            (m.user_id !== null ? `id${m.user_id}` : 'аноним'));
      const ts = m.created_at.slice(0, 16).replace('T', ' ');
      const text = m.text.replace(/\s+/g, ' ').trim();
      return `[${ts}] ${who}: ${text}`;
    })
    .join('\n');
}

// Render the structured payload into a Russian markdown digest that
// reads well in a Telegram DM.
export function renderSummary(
  payload: DigestPayload,
  meta: { chatTitle: string | undefined; chatId: number; windowHours: number; messagesCount: number },
): string {
  const lines: string[] = [];
  const title = meta.chatTitle ?? `чат ${meta.chatId}`;
  lines.push(`🧠 Сводка по «${title}» · последние ${meta.windowHours}ч · ${meta.messagesCount} сообщений`);
  lines.push('');
  if (payload.gist) {
    lines.push(payload.gist);
    lines.push('');
  }
  appendSection(lines, '📌 О чём говорили', payload.topics);
  appendSection(lines, '❓ Открытые вопросы', payload.open_questions);
  appendSection(lines, '✅ Решения и договорённости', payload.decisions);
  appendSection(lines, '🎯 Сигналы для твоих проектов', payload.project_signals);
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

// Splits a long rendered summary into TG-sized chunks at line
// boundaries. We never break inside a bullet — readability over
// packing density.
export function splitForTelegram(text: string): string[] {
  if (text.length <= TG_MAX_MESSAGE) return [text];
  const chunks: string[] = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if (buf.length + line.length + 1 > TG_MAX_MESSAGE) {
      chunks.push(buf.trimEnd());
      buf = '';
    }
    buf += `${line}\n`;
  }
  if (buf.trim()) chunks.push(buf.trimEnd());
  return chunks;
}

export interface BuildAndDeliverDeps {
  bot: Bot;
  ownerTelegramId: number;
  store: DigestStore;
  generator: DigestGenerator;
  logger: Logger;
  // Forum mode (optional). When a router is supplied and routeReports
  // is on, the digest is also posted into the source chat's agent
  // thread. keepOwnerDm controls whether the owner still gets the DM
  // copy during the parallel-run cutover (default true).
  forumRouter?: ForumRouter;
  forumRouteReports?: boolean;
  forumKeepOwnerDm?: boolean;
}

export interface BuildAndDeliverInput {
  chatId: number;
  chatTitle: string | undefined;
  windowHours: number;
  // Daily scheduler always wants delivery. Future paths (e.g. dry
  // run, regenerate without DM) can opt out.
  deliver: boolean;
}

export interface BuildAndDeliverResult {
  reportId: number | null;
  messagesCount: number;
  summaryMd: string;
  delivered: boolean;
  skippedReason: 'no_messages' | null;
}

// One-shot: pull messages, ask Claude, save report, DM the owner.
// Used both by the daily scheduler and by /pulse on demand.
export async function buildAndDeliverDigest(
  deps: BuildAndDeliverDeps,
  input: BuildAndDeliverInput,
): Promise<BuildAndDeliverResult> {
  const { store, generator, bot, ownerTelegramId, logger, forumRouter } = deps;
  const routeToForum = Boolean(forumRouter && deps.forumRouteReports);
  const keepOwnerDm = deps.forumKeepOwnerDm ?? true;
  const sinceIso = new Date(
    Date.now() - input.windowHours * 60 * 60 * 1000,
  ).toISOString();
  const messages = store.listRecentMessages(
    input.chatId,
    sinceIso,
    MAX_MESSAGES_PER_DIGEST,
  );

  if (messages.length === 0) {
    logger.info('digest: no messages in window', {
      chatId: input.chatId,
      windowHours: input.windowHours,
    });
    return {
      reportId: null,
      messagesCount: 0,
      summaryMd: '',
      delivered: false,
      skippedReason: 'no_messages',
    };
  }

  const ctx = store.getContext(input.chatId);
  const projectContext = ctx?.custom_instructions ?? '';

  const payload = await generator.generate({
    chatTitle: input.chatTitle,
    windowHours: input.windowHours,
    projectContext,
    messages,
  });

  const summaryMd = renderSummary(payload, {
    chatTitle: input.chatTitle,
    chatId: input.chatId,
    windowHours: input.windowHours,
    messagesCount: messages.length,
  });

  const row = store.saveDigest({
    chatId: input.chatId,
    chatTitle: input.chatTitle,
    windowHours: input.windowHours,
    messagesCount: messages.length,
    payload,
    summaryMd,
  });
  if (payload.gist) store.upsertContextSummary(input.chatId, payload.gist);

  // Flow 1: route the report into the source chat's agent thread.
  // dedup_key = the digest row id, so a retry can't double-post but
  // each new digest does.
  if (routeToForum && forumRouter) {
    try {
      await forumRouter.routeReport({
        sourceChatId: input.chatId,
        sourceLabel: input.chatTitle,
        summary: summaryMd,
        raw: payload,
        periodStart: sinceIso,
        periodEnd: row.generated_at,
        dedupKey: `digest:${row.id}`,
      });
    } catch (err) {
      logger.error('digest: forum route failed', {
        chatId: input.chatId,
        reportId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Owner DM. Suppressed once forum routing is on and the parallel-run
  // copy is no longer wanted (FORUM_KEEP_OWNER_DM=false).
  const wantOwnerDm = input.deliver && (!routeToForum || keepOwnerDm);
  let delivered = false;
  if (wantOwnerDm) {
    try {
      for (const chunk of splitForTelegram(summaryMd)) {
        await bot.api.sendMessage(ownerTelegramId, chunk, {
          link_preview_options: { is_disabled: true },
        });
      }
      store.markDelivered(row.id);
      delivered = true;
      logger.info('digest: delivered', {
        chatId: input.chatId,
        reportId: row.id,
        chars: summaryMd.length,
      });
    } catch (err) {
      logger.error('digest: delivery failed', {
        chatId: input.chatId,
        reportId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    reportId: row.id,
    messagesCount: messages.length,
    summaryMd,
    delivered,
    skippedReason: null,
  };
}

export interface DigestSchedulerDeps {
  bot: Bot;
  ownerTelegramId: number;
  chats: ChatService;
  store: DigestStore;
  generator: DigestGenerator;
  logger: Logger;
  // 0..23 — UTC hour at which to run the daily sweep. 06 UTC = 09 MSK.
  dailyHourUtc: number;
  // Window each report covers. 24 by default.
  windowHours: number;
  // Forum routing (optional) — forwarded to buildAndDeliverDigest.
  forumRouter?: ForumRouter;
  forumRouteReports?: boolean;
  forumKeepOwnerDm?: boolean;
}

export interface DigestSchedulerHandle {
  stop(): void;
  runOnce(): Promise<void>;
}

// Lightweight scheduler: wakes once a minute, fires when the wall
// clock crosses the configured UTC hour. No node-cron dependency —
// same approach as backup.ts.
export function startDigestScheduler(
  deps: DigestSchedulerDeps,
): DigestSchedulerHandle {
  const { logger, dailyHourUtc, windowHours } = deps;
  let lastFiredYmd = '';
  let stopped = false;
  let running = false;

  const runOnce = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const chats = deps.chats.listAll();
      logger.info('digest: daily sweep start', { chatCount: chats.length });
      for (const c of chats) {
        try {
          await buildAndDeliverDigest(
            {
              bot: deps.bot,
              ownerTelegramId: deps.ownerTelegramId,
              store: deps.store,
              generator: deps.generator,
              logger: deps.logger,
              forumRouter: deps.forumRouter,
              forumRouteReports: deps.forumRouteReports,
              forumKeepOwnerDm: deps.forumKeepOwnerDm,
            },
            {
              chatId: c.chat_id,
              chatTitle: c.title ?? undefined,
              windowHours,
              deliver: true,
            },
          );
        } catch (err) {
          logger.error('digest: chat failed', {
            chatId: c.chat_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      running = false;
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10);
    if (now.getUTCHours() === dailyHourUtc && lastFiredYmd !== ymd) {
      lastFiredYmd = ymd;
      try {
        await runOnce();
      } catch (err) {
        logger.error('digest: sweep crashed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const interval = setInterval(() => void tick(), 60_000);
  logger.info('digest scheduler armed', { dailyHourUtc, windowHours });

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
    runOnce,
  };
}
