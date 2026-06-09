// Agent chat — a conversational analyst the owner talks to directly in
// the bot's DM. Unlike the slash commands (/pulse, /digest, /memory),
// this is free-form: the owner asks a question in plain Russian and
// Claude decides which data to pull (semantic memory search, per-chat
// digests, the chat list, recent transcripts) via tool-use, then
// answers grounded in what it found.
//
// Multi-turn: a small per-owner session keeps the running conversation
// so follow-up questions ("а что по второму чату?") have context. The
// session is in-memory only — a restart starts a fresh thread, which is
// fine for a single-owner assistant.

import Anthropic from '@anthropic-ai/sdk';

import type { ChatService } from './db/chats.js';
import type { DigestStore } from './db/digests.js';
import type { Logger } from './logger.js';
import type { MemoryService } from './memory/service.js';
import { parseDuration } from './owner_commands.js';

// How many transcript messages a single get_recent_messages tool call
// may return. Keeps the tool result well under the model's context.
const MAX_TRANSCRIPT_MESSAGES = 150;
// Hard ceiling on the agent loop — each step is one Claude round-trip.
// A well-behaved question resolves in 1-3 (search → answer); the cap
// just stops a runaway tool loop.
const MAX_STEPS = 6;
const MAX_ANSWER_TOKENS = 1500;
// Trim the running session to the last N messages before each call so
// a long-lived DM thread doesn't grow the prompt unbounded.
const MAX_SESSION_MESSAGES = 24;
// Reset a session that's been idle this long — a question asked hours
// later is almost always a new topic, and stale context only confuses.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `Ты — личный аналитик владельца по его Telegram-чатам. Бот, частью которого ты являешься, состоит во всех этих группах, читает каждое сообщение, классифицирует его и хранит историю. Твоя задача — отвечать на вопросы владельца про то, что происходит в его чатах и проектах, опираясь ТОЛЬКО на реальные данные, которые ты достаёшь через инструменты.

Как работать:
- Прежде чем отвечать по сути, подними нужные данные инструментами. Не выдумывай факты, цифры, имена и договорённости — если данных нет, так и скажи.
- list_chats — список чатов с id и краткой сутью. Начни с него, если не знаешь, про какой чат речь, или нужно сопоставить название с id.
- search_memory — семантический поиск по всем сообщениям (и расшифровкам из transcribe). Лучший инструмент для "что говорили про X", "были ли возражения по цене", "кто спрашивал про Y".
- get_chat_digest — свежая структурированная сводка по конкретному чату (суть, открытые вопросы, решения, на что обратить внимание).
- get_recent_messages — сырой журнал последних сообщений чата за окно в часах. Бери, когда нужны дословные формулировки или хронология.
- Можно вызывать несколько инструментов подряд, чтобы собрать полную картину.

Стиль ответа:
- По-русски, живым человеческим языком, без канцелярита и маркетинга.
- Кратко и по делу. Списки — где они уместны. Указывай авторов как @username, когда они известны.
- Если вопрос требует данных, которых в чатах нет, честно скажи об этом, а не фантазируй.
- Ты ассистент-аналитик, а не отвечаешь в самих группах. Здесь ты говоришь только с владельцем.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_chats',
    description:
      'Список всех чатов, которые видит бот: id, название, число сообщений, время последней активности и краткая суть (gist последней сводки). Используй, чтобы сопоставить название чата с его chat_id или получить обзор.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_memory',
    description:
      'Семантический поиск по истории сообщений всех чатов (и расшифровок). Возвращает наиболее близкие по смыслу фрагменты с автором, чатом, датой и оценкой релевантности.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Поисковый запрос на естественном языке, что именно ищем.',
        },
        chat: {
          type: 'string',
          description:
            'Необязательно. Подстрока названия чата или его chat_id — ограничить поиск одним чатом.',
        },
        since: {
          type: 'string',
          description:
            'Необязательно. Окно по времени: "24h", "7d", "30d", "12h30m". Ищет только свежее этого.',
        },
        limit: {
          type: 'integer',
          description: 'Необязательно. Сколько фрагментов вернуть, 1..20. По умолчанию 8.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_chat_digest',
    description:
      'Последняя структурированная сводка по одному чату: суть, темы, открытые вопросы, решения, сигналы для проектов, кому ответить, что легко пропустить.',
    input_schema: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Подстрока названия чата или его chat_id.',
        },
      },
      required: ['chat'],
    },
  },
  {
    name: 'get_recent_messages',
    description:
      'Сырой журнал последних сообщений одного чата за окно в часах. Для дословных формулировок и хронологии.',
    input_schema: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Подстрока названия чата или его chat_id.',
        },
        hours: {
          type: 'integer',
          description: 'Окно в часах, 1..168. По умолчанию 24.',
        },
        limit: {
          type: 'integer',
          description: `Максимум сообщений, 1..${MAX_TRANSCRIPT_MESSAGES}. По умолчанию 100.`,
        },
      },
      required: ['chat'],
    },
  },
];

export interface AgentChatDeps {
  apiKey: string;
  model: string;
  chats: ChatService;
  digests: DigestStore;
  memory: MemoryService;
  logger: Logger;
}

export interface AgentChat {
  // Runs one user turn through the agent loop and returns the answer
  // text. onActivity fires before each Claude / tool round so the
  // caller can refresh the "typing…" indicator.
  ask(
    sessionKey: number,
    userText: string,
    onActivity?: () => void,
  ): Promise<string>;
  // Drops the running conversation for this owner.
  reset(sessionKey: number): void;
}

interface Session {
  messages: Anthropic.MessageParam[];
  updatedAt: number;
}

export function createAgentChat(deps: AgentChatDeps): AgentChat {
  const { apiKey, model, chats, digests, memory, logger } = deps;
  const client = new Anthropic({ apiKey });
  const sessions = new Map<number, Session>();

  function getSession(key: number): Session {
    const existing = sessions.get(key);
    if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
      return existing;
    }
    const fresh: Session = { messages: [], updatedAt: Date.now() };
    sessions.set(key, fresh);
    return fresh;
  }

  // Resolve a "chat" tool argument that may be either a numeric chat_id
  // or a case-insensitive substring of the title. Numeric ids win; on a
  // substring we return the most recently active match.
  function resolveChat(
    arg: string,
  ): { chat_id: number; title: string | null } | null {
    const list = chats.listAll();
    const trimmed = arg.trim();
    const asId = Number(trimmed);
    if (Number.isFinite(asId) && /^-?\d+$/.test(trimmed)) {
      const byId = list.find((c) => c.chat_id === asId);
      if (byId) return { chat_id: byId.chat_id, title: byId.title };
    }
    const needle = trimmed.toLowerCase();
    const byName = list.find((c) => (c.title ?? '').toLowerCase().includes(needle));
    return byName ? { chat_id: byName.chat_id, title: byName.title } : null;
  }

  function toolListChats(): string {
    const list = chats.listAll();
    if (list.length === 0) return 'Бот ещё не видел ни одного чата.';
    return list
      .map((c) => {
        const title = c.title ?? '(без названия)';
        const last = c.last_message_at
          ? c.last_message_at.slice(0, 16).replace('T', ' ')
          : '—';
        const ctx = digests.getContext(c.chat_id);
        const gist = ctx?.summary?.trim();
        const lines = [
          `• ${title} (chat_id: ${c.chat_id})`,
          `  сообщений: ${c.total_messages} · горячих лидов: ${c.hot_leads} · последнее: ${last}`,
        ];
        if (gist) lines.push(`  суть: ${truncate(gist, 280)}`);
        return lines.join('\n');
      })
      .join('\n');
  }

  async function toolSearchMemory(input: Record<string, unknown>): Promise<string> {
    if (!memory.enabled) {
      return 'Семантическая память отключена (нет OPENAI_API_KEY / MEMORY_ENABLED=false). Используй get_recent_messages или get_chat_digest.';
    }
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) return 'Пустой запрос — нужен непустой query.';

    let chatId: number | undefined;
    if (typeof input.chat === 'string' && input.chat.trim()) {
      const resolved = resolveChat(input.chat);
      if (!resolved) return `Чат "${input.chat}" не найден. Сначала вызови list_chats.`;
      chatId = resolved.chat_id;
    }
    let sinceIso: string | undefined;
    if (typeof input.since === 'string' && input.since.trim()) {
      const ms = parseDuration(input.since);
      if (ms !== null) sinceIso = new Date(Date.now() - ms).toISOString();
    }
    let limit = 8;
    if (typeof input.limit === 'number' && Number.isInteger(input.limit)) {
      limit = Math.min(Math.max(input.limit, 1), 20);
    }

    const hits = await memory.search(query, { limit, chatId, sinceIso });
    if (hits.length === 0) return `По запросу "${query}" ничего не нашёл.`;
    return hits
      .map((h, i) => {
        const when = h.payload.created_at?.slice(0, 16).replace('T', ' ') ?? '?';
        const score = (h.score * 100).toFixed(0);
        const where =
          h.payload.source === 'transcribe'
            ? (h.payload.title ?? '(расшифровка)')
            : (h.payload.chat_title ?? `chat ${h.payload.chat_id ?? '?'}`);
        const who = h.payload.username
          ? '@' + h.payload.username
          : h.payload.user_id
            ? `user${h.payload.user_id}`
            : '';
        const cls = h.payload.class ? ` · ${h.payload.class}` : '';
        const meta = [where, who, cls].filter(Boolean).join(' · ');
        return `${i + 1}. [${score}%] ${meta} · ${when}\n${h.payload.text.slice(0, 400)}`;
      })
      .join('\n\n');
  }

  function toolGetChatDigest(input: Record<string, unknown>): string {
    const arg = typeof input.chat === 'string' ? input.chat : '';
    const resolved = resolveChat(arg);
    if (!resolved) return `Чат "${arg}" не найден. Сначала вызови list_chats.`;
    const digest = digests.latestForChat(resolved.chat_id);
    if (!digest) {
      return `По чату «${resolved.title ?? resolved.chat_id}» сводок ещё нет. Попробуй get_recent_messages.`;
    }
    const when = digest.generated_at.slice(0, 16).replace('T', ' ');
    return `Сводка по «${resolved.title ?? resolved.chat_id}» (сгенерирована ${when}, окно ${digest.window_hours}ч, ${digest.messages_count} сообщений):\n\n${digest.summary_md}`;
  }

  function toolGetRecentMessages(input: Record<string, unknown>): string {
    const arg = typeof input.chat === 'string' ? input.chat : '';
    const resolved = resolveChat(arg);
    if (!resolved) return `Чат "${arg}" не найден. Сначала вызови list_chats.`;
    let hours = 24;
    if (typeof input.hours === 'number' && Number.isFinite(input.hours)) {
      hours = Math.min(Math.max(Math.round(input.hours), 1), 168);
    }
    let limit = 100;
    if (typeof input.limit === 'number' && Number.isInteger(input.limit)) {
      limit = Math.min(Math.max(input.limit, 1), MAX_TRANSCRIPT_MESSAGES);
    }
    const sinceIso = new Date(Date.now() - hours * 3_600_000).toISOString();
    const messages = digests.listRecentMessages(resolved.chat_id, sinceIso, limit);
    if (messages.length === 0) {
      return `В чате «${resolved.title ?? resolved.chat_id}» за последние ${hours}ч сообщений нет.`;
    }
    const transcript = messages
      .map((m) => {
        const who = m.username
          ? `@${m.username}`
          : m.first_name?.trim() || (m.user_id !== null ? `id${m.user_id}` : 'аноним');
        const ts = m.created_at.slice(0, 16).replace('T', ' ');
        return `[${ts}] ${who}: ${m.text.replace(/\s+/g, ' ').trim()}`;
      })
      .join('\n');
    return `Журнал «${resolved.title ?? resolved.chat_id}» за ${hours}ч (${messages.length} сообщений):\n${transcript}`;
  }

  async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
    try {
      switch (name) {
        case 'list_chats':
          return toolListChats();
        case 'search_memory':
          return await toolSearchMemory(input);
        case 'get_chat_digest':
          return toolGetChatDigest(input);
        case 'get_recent_messages':
          return toolGetRecentMessages(input);
        default:
          return `Неизвестный инструмент: ${name}`;
      }
    } catch (err) {
      logger.error('agent_chat: tool failed', {
        tool: name,
        error: err instanceof Error ? err.message : String(err),
      });
      return `Ошибка инструмента ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function trimSession(session: Session): void {
    if (session.messages.length <= MAX_SESSION_MESSAGES) return;
    // Keep the tail, then advance to the first plain user-text turn so
    // we never start the window on a dangling tool_result (which would
    // be an orphan without its tool_use) or an assistant turn.
    let sliced = session.messages.slice(-MAX_SESSION_MESSAGES);
    const firstClean = sliced.findIndex(
      (m) => m.role === 'user' && typeof m.content === 'string',
    );
    if (firstClean > 0) sliced = sliced.slice(firstClean);
    else if (firstClean === -1) sliced = [];
    session.messages = sliced;
  }

  return {
    async ask(sessionKey, userText, onActivity): Promise<string> {
      const session = getSession(sessionKey);
      session.messages.push({ role: 'user', content: userText });
      trimSession(session);

      let answer = '';
      for (let step = 0; step < MAX_STEPS; step++) {
        onActivity?.();
        const response = await client.messages.create({
          model,
          max_tokens: MAX_ANSWER_TOKENS,
          system: [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          ],
          tools: TOOLS,
          messages: session.messages,
        });

        session.messages.push({ role: 'assistant', content: response.content });

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        if (toolUses.length === 0) {
          answer = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();
          break;
        }

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          onActivity?.();
          const out = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
          logger.info('agent_chat: tool', {
            tool: tu.name,
            input: truncate(JSON.stringify(tu.input ?? {}), 200),
          });
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
        }
        session.messages.push({ role: 'user', content: results });
      }

      session.updatedAt = Date.now();
      if (!answer) {
        answer =
          'Не получилось собрать ответ за разумное число шагов. Попробуй переформулировать вопрос или уточни, про какой чат речь.';
      }
      return answer;
    },

    reset(sessionKey): void {
      sessions.delete(sessionKey);
    },
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
