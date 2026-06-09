import type { Bot, Context, Filter } from 'grammy';

import type { AgentChat } from './agent_chat.js';
import type { AgentService } from './db/agents.js';
import type { ChatService } from './db/chats.js';
import type { DigestStore } from './db/digests.js';
import { buildAndDeliverDigest, type DigestGenerator, splitForTelegram } from './digest.js';
import type { ForumRouter } from './forum.js';
import {
  clusterHash,
  findDuplicates,
  recordAlert,
  renderClusterMarkdown,
  wasSentRecently,
  type DupSchedulerHandle,
} from './dup_detector.js';
import type { Db } from './db/index.js';
import type { Logger } from './logger.js';
import type { MemoryService } from './memory/service.js';

export interface OwnerCommandsDeps {
  bot: Bot;
  ownerTelegramId: number;
  chats: ChatService;
  store: DigestStore;
  generator: DigestGenerator;
  windowHours: number;
  logger: Logger;
  memory: MemoryService;
  db: Db;
  dupHandle?: DupSchedulerHandle;
  // Optional: when set, /reset clears the running conversation thread.
  agentChat?: AgentChat;
  // Forum mode (optional). Enables /topics, /bindthread, /routes,
  // /route, /unroute and routes manual /pulse, /digest into threads.
  agents?: AgentService;
  forumRouter?: ForumRouter;
  forumGroupId?: number;
  forumRouteReports?: boolean;
  forumKeepOwnerDm?: boolean;
}

// Help blurb shown for /help. Kept terse — the owner already knows
// the bot exists; he just needs the surface area on one screen.
const HELP_TEXT = [
  'Просто напиши мне вопрос обычным текстом — я аналитик по твоим чатам.',
  'Например: «что обсуждали в AICEX за последние сутки?», «были ли возражения',
  'по цене на этой неделе?», «кому я не ответил?». Я сам подниму нужные данные',
  '(поиск по памяти, сводки, журнал сообщений) и отвечу.',
  '',
  'Команды (только для владельца, в этом DM):',
  '',
  '/pulse — сводки по всем чатам за последние N часов (по умолчанию 24).',
  '/pulse 48 — то же самое с произвольным окном в часах.',
  '/chats — список чатов: название, id, последняя сводка, кол-во сообщений за сутки.',
  '/digest <chat_id> — сгенерировать и прислать свежую сводку по одному чату.',
  '/digest <chat_id> 12 — то же, с явным окном в часах.',
  '/context <chat_id> <текст> — задать project_context для чата: что важно владельцу',
  '  (продукты, ICP, на что обращать внимание). Используется в каждой сводке.',
  '/memory <запрос> [--chat=X --source=Y --since=7d --limit=N] — семантический поиск.',
  '  По всем источникам (tg-agent + transcribe). Фильтры опциональны.',
  '  Пример: /memory возражения по цене --chat=AICEX --since=7d',
  '/duplicates [дней=7] — найти повторяющиеся вопросы от разных людей.',
  '  Бот ищет кластеры близких по смыслу сообщений (sim ≥ 0.75) с ≥ 2 разными авторами.',
  '  Авто-сводка приходит раз в сутки сама — команда для ручного запроса.',
  '/reset — забыть текущий диалог со мной и начать с чистого листа.',
  '',
  'Форум-режим (ветки = агенты):',
  '/topics — список агентов и привязанных тем.',
  '/bindthread <slug|имя> — привязать текущую тему к агенту (отправить внутри темы).',
  '/createtopics — создать недостающие темы для агентов (в форум-группе).',
  '/routes — какой чат в какую ветку маршрутизируется.',
  '/route <source_chat_id> <slug> — задать маршрут чата в ветку.',
  '/unroute <source_chat_id> — убрать маршрут.',
  '/help — это сообщение.',
].join('\n');

// Register handlers. Must be wired BEFORE bot.on('message:text') in
// bot.ts so commands take priority over the generic handler. We
// achieve that by registering on the same Bot instance from index.ts
// before createBot() is called — see index.ts ordering.
export function registerOwnerCommands(deps: OwnerCommandsDeps): void {
  const { bot, ownerTelegramId, chats, store, generator, windowHours, logger, memory, db, agentChat, agents, forumRouter } = deps;

  const forumDeps = {
    forumRouter,
    forumRouteReports: deps.forumRouteReports,
    forumKeepOwnerDm: deps.forumKeepOwnerDm,
  };

  const isOwnerDm = (ctx: Context): boolean =>
    ctx.chat?.type === 'private' && ctx.from?.id === ownerTelegramId;

  bot.command('help', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    await ctx.reply(HELP_TEXT, { link_preview_options: { is_disabled: true } });
  });

  bot.command('pulse', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    const arg = ctx.match?.toString().trim();
    const hours = parseWindowArg(arg, windowHours);
    if (hours === null) {
      await ctx.reply('Использование: /pulse [окно_в_часах], например /pulse 24');
      return;
    }
    const list = chats.listAll();
    if (list.length === 0) {
      await ctx.reply('Бот ещё не видел ни одного чата.');
      return;
    }
    await ctx.reply(`Считаю сводки по ${list.length} чатам, окно ${hours}ч…`);
    let sent = 0;
    let skipped = 0;
    for (const c of list) {
      try {
        const result = await buildAndDeliverDigest(
          {
            bot,
            ownerTelegramId,
            store,
            generator,
            logger,
            ...forumDeps,
          },
          {
            chatId: c.chat_id,
            chatTitle: c.title ?? undefined,
            windowHours: hours,
            deliver: true,
          },
        );
        if (result.delivered) sent += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        logger.error('pulse: chat failed', {
          chatId: c.chat_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await ctx.reply(`Готово. Отправлено: ${sent}, пропущено: ${skipped}.`);
  });

  bot.command('chats', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    const list = chats.listAll();
    if (list.length === 0) {
      await ctx.reply('Чаты не зарегистрированы.');
      return;
    }
    const lines: string[] = ['Чаты:', ''];
    for (const c of list) {
      const title = c.title ?? '(без названия)';
      const last = c.last_message_at
        ? c.last_message_at.slice(0, 16).replace('T', ' ')
        : '—';
      const context = store.getContext(c.chat_id);
      const gist = context?.summary?.trim();
      lines.push(`• ${title}`);
      lines.push(`  id: ${c.chat_id} · сообщений: ${c.total_messages} · последнее: ${last}`);
      if (gist) lines.push(`  суть: ${truncate(gist, 240)}`);
      if (context?.custom_instructions?.trim()) {
        lines.push(`  context: ${truncate(context.custom_instructions, 160)}`);
      }
      lines.push('');
    }
    for (const chunk of splitForTelegram(lines.join('\n').trim())) {
      await ctx.reply(chunk, { link_preview_options: { is_disabled: true } });
    }
  });

  bot.command('digest', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    const args = (ctx.match?.toString() ?? '').trim().split(/\s+/).filter(Boolean);
    if (args.length === 0) {
      await ctx.reply('Использование: /digest <chat_id> [окно_в_часах]');
      return;
    }
    const chatId = Number(args[0]);
    if (!Number.isFinite(chatId)) {
      await ctx.reply('chat_id должен быть числом. Список чатов: /chats');
      return;
    }
    const hours = parseWindowArg(args[1], windowHours);
    if (hours === null) {
      await ctx.reply('Окно должно быть числом 1..168 часов.');
      return;
    }
    const chatRow = chats.listAll().find((c) => c.chat_id === chatId);
    if (!chatRow) {
      await ctx.reply(`Чат ${chatId} не найден. /chats — список.`);
      return;
    }
    await ctx.reply(`Готовлю сводку по «${chatRow.title ?? chatId}», окно ${hours}ч…`);
    try {
      const result = await buildAndDeliverDigest(
        { bot, ownerTelegramId, store, generator, logger, ...forumDeps },
        {
          chatId,
          chatTitle: chatRow.title ?? undefined,
          windowHours: hours,
          deliver: true,
        },
      );
      if (!result.delivered && result.skippedReason === 'no_messages') {
        await ctx.reply(`За последние ${hours}ч в этом чате не было сообщений.`);
      }
    } catch (err) {
      logger.error('digest command failed', {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply(
        `Не получилось: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  bot.command('context', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    const raw = (ctx.match?.toString() ?? '').trim();
    const match = /^(-?\d+)\s+([\s\S]+)$/.exec(raw);
    if (!match) {
      await ctx.reply(
        'Использование: /context <chat_id> <текст>. Чтобы посмотреть текущий — /chats.',
      );
      return;
    }
    const chatId = Number(match[1]);
    const text = (match[2] ?? '').trim();
    if (!Number.isFinite(chatId) || text === '') {
      await ctx.reply('Нужен валидный chat_id и непустой текст.');
      return;
    }
    store.setCustomInstructions(chatId, text);
    await ctx.reply(
      `Контекст для чата ${chatId} сохранён. Будет учитываться в следующей сводке.`,
    );
  });

  bot.command('memory', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    const raw = ctx.match?.toString().trim() ?? '';
    if (!raw) {
      await ctx.reply(
        [
          'Использование: /memory <запрос> [фильтры]',
          '',
          'Фильтры:',
          '  --chat=<подстрока>   — только из чата (по части названия)',
          '  --source=<src>       — tg-agent | transcribe',
          '  --since=<dur>        — 24h | 7d | 30d | 12h30m',
          '  --limit=<N>          — до 50',
          '',
          'Пример: /memory возражения по цене --chat=AICEX --since=7d',
        ].join('\n'),
      );
      return;
    }
    if (!memory.enabled) {
      await ctx.reply(
        'Память отключена. Поставь OPENAI_API_KEY в .env (и MEMORY_ENABLED=true) и перезапусти бота.',
      );
      return;
    }
    const parsed = parseMemoryArgs(raw);
    if (!parsed.query) {
      await ctx.reply('Пустой запрос. Пример: /memory возражения --since=7d');
      return;
    }
    // Resolve --chat=<substring> to chat_id by matching against
    // tg_chats titles. Multiple matches → first by updated_at desc.
    let chatId: number | undefined;
    if (parsed.chat) {
      const needle = parsed.chat.toLowerCase();
      const found = chats
        .listAll()
        .find((c) => (c.title ?? '').toLowerCase().includes(needle));
      if (!found) {
        await ctx.reply(`Чата с "${parsed.chat}" в названии не нашёл.`);
        return;
      }
      chatId = found.chat_id;
    }
    try {
      const hits = await memory.search(parsed.query, {
        limit: parsed.limit ?? 5,
        chatId,
        source: parsed.source,
        sinceIso: parsed.sinceIso,
      });
      if (hits.length === 0) {
        await ctx.reply(`По запросу "${parsed.query}" ничего не нашёл.`);
        return;
      }
      const body = hits
        .map((h, i) => {
          const when = h.payload.created_at?.slice(0, 16).replace('T', ' ') ?? '?';
          const score = (h.score * 100).toFixed(0);
          const sourceIcon = sourceIconFor(h.payload.source, h.payload.kind);
          const where = h.payload.source === 'transcribe'
            ? (h.payload.title ?? '(без названия)')
            : (h.payload.chat_title ?? `chat ${h.payload.chat_id ?? '?'}`);
          const who = h.payload.username
            ? '@' + h.payload.username
            : (h.payload.user_id ? `user${h.payload.user_id}` : '');
          const cls = h.payload.class ? ` · ${h.payload.class}` : '';
          const meta = [escapeHtml(where), who && escapeHtml(who), escapeHtml(cls)].filter(Boolean).join(' · ');
          const text = h.payload.text.slice(0, 350);
          return `${i + 1}. <b>${score}%</b> ${sourceIcon} ${meta} · <i>${escapeHtml(when)}</i>\n${escapeHtml(text)}`;
        })
        .join('\n\n');
      const message = `🧬 Память по "${escapeHtml(parsed.query)}":\n\n${body}`;
      for (const chunk of splitForTelegram(message)) {
        await ctx.reply(chunk, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (err) {
      logger.error('memory: /memory command failed', {
        query: parsed.query.slice(0, 80),
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply('Ошибка поиска. Проверь логи и Qdrant.');
    }
  });

  bot.command('duplicates', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    if (!memory.enabled) {
      await ctx.reply('Память отключена — детектор дубликатов не запустится.');
      return;
    }
    const arg = ctx.match?.toString().trim() ?? '';
    const days = arg ? Number(arg) : 7;
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      await ctx.reply('Использование: /duplicates [дней=7]\nДиапазон 1..90.');
      return;
    }
    await ctx.reply(`🔍 Ищу дубликаты вопросов за ${days} дней…`);
    try {
      const clusters = await findDuplicates(
        { db, memory, chats, logger },
        { daysBack: days, minUsers: 2, minSimilarity: 0.75 },
      );
      if (clusters.length === 0) {
        await ctx.reply(`За ${days} дн дубликатов не нашёл (порог: 2+ уникальных автора, sim ≥ 0.75).`);
        return;
      }
      // For on-demand /duplicates we surface ALL clusters (don't
      // apply the 7-day cooldown that the scheduler uses), but
      // still record them so the scheduler skips duplicates next
      // run.
      let sent = 0;
      for (const cluster of clusters) {
        const md = renderClusterMarkdown(cluster);
        for (const chunk of splitForTelegram(md)) {
          await ctx.reply(chunk, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          });
        }
        const hash = clusterHash(cluster);
        if (!wasSentRecently(db, hash, 7)) recordAlert(db, cluster);
        sent++;
        if (sent >= 10) break;
      }
      await ctx.reply(`Готово. Кластеров: ${clusters.length}, показано: ${sent}.`);
    } catch (err) {
      logger.error('/duplicates failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply('Ошибка детектора. Проверь логи.');
    }
  });

  bot.command('reset', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    agentChat?.reset(ownerTelegramId);
    await ctx.reply('Диалог сброшен. Начнём с чистого листа — задавай вопрос.');
  });

  // ── Forum management ─────────────────────────────────────────────
  const isOwner = (ctx: Context): boolean => ctx.from?.id === ownerTelegramId;

  // /topics — roster of agents and their bound threads. Works in the
  // owner DM or inside the forum group.
  bot.command('topics', async (ctx) => {
    if (!isOwner(ctx)) return;
    if (!agents) {
      await ctx.reply('Форум-режим выключен (нет FORUM_GROUP_ID / FORUM_ENABLED).');
      return;
    }
    const list = agents.list();
    const lines = ['Агенты (ветки форума):', ''];
    for (const a of list) {
      const bound = a.thread_id !== null ? `thread ${a.thread_id}` : 'не привязан';
      const active = a.is_active ? '' : ' · выключен';
      lines.push(`• ${a.name} (${a.slug}) — ${bound} · ${a.model}${active}`);
    }
    lines.push('', 'Привязать тему: зайди в нужную тему и отправь /bindthread <slug>.');
    await ctx.reply(lines.join('\n'), { link_preview_options: { is_disabled: true } });
  });

  // /bindthread <slug> — bind the current topic to an agent. Must be
  // sent inside the topic in the forum group.
  bot.command('bindthread', async (ctx) => {
    if (!isOwner(ctx) || !agents) return;
    if (deps.forumGroupId === undefined || ctx.chat?.id !== deps.forumGroupId) {
      await ctx.reply('Команду нужно отправить внутри темы в форум-группе.');
      return;
    }
    const arg = ctx.match?.toString().trim();
    if (!arg) {
      await ctx.reply('Использование: /bindthread <slug или имя>. Список: /topics');
      return;
    }
    // Match by slug first, then by display name (case-insensitive) so
    // /bindthread Финансист works as well as /bindthread finance.
    const needle = arg.toLowerCase();
    const agent =
      agents.getBySlug(needle) ??
      agents.list().find((a) => a.name.toLowerCase() === needle) ??
      null;
    if (!agent) {
      await ctx.reply(`Агент "${arg}" не найден. /topics — список.`);
      return;
    }
    const threadId = ctx.message?.message_thread_id ?? 1;
    agents.bindThread(agent.slug, threadId);
    await ctx.reply(`✓ Тема (thread ${threadId}) привязана к агенту «${agent.name}».`);
  });

  // /createtopics — create a forum topic for every agent that has no
  // bound thread yet, and bind it. Run inside the forum group. Useful
  // for a fresh setup; existing topics are left as-is.
  bot.command('createtopics', async (ctx) => {
    if (!isOwner(ctx) || !agents) return;
    if (deps.forumGroupId === undefined || ctx.chat?.id !== deps.forumGroupId) {
      await ctx.reply('Команду нужно отправить в форум-группе.');
      return;
    }
    const pending = agents.list().filter((a) => a.thread_id === null && a.slug !== 'general');
    if (pending.length === 0) {
      await ctx.reply('Все агенты уже привязаны к темам. /topics — список.');
      return;
    }
    const created: string[] = [];
    for (const a of pending) {
      try {
        const topic = await bot.api.createForumTopic(deps.forumGroupId, a.name);
        agents.bindThread(a.slug, topic.message_thread_id);
        created.push(`${a.name} (thread ${topic.message_thread_id})`);
      } catch (err) {
        logger.error('forum: createForumTopic failed', {
          slug: a.slug,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await ctx.reply(
      created.length > 0
        ? `✓ Созданы и привязаны темы:\n${created.map((c) => `• ${c}`).join('\n')}`
        : 'Не удалось создать темы. Проверь, что бот — админ с правом Manage Topics.',
    );
  });

  // /routes — list source-chat → agent routes.
  bot.command('routes', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    if (!agents) {
      await ctx.reply('Форум-режим выключен.');
      return;
    }
    const routes = agents.listRoutes();
    if (routes.length === 0) {
      await ctx.reply(
        'Маршрутов нет. Добавить: /route <source_chat_id> <slug>.\n' +
          'Без маршрута отчёт уходит в General или классифицируется моделью.',
      );
      return;
    }
    const lines = ['Маршруты (чат → агент):', ''];
    for (const r of routes) {
      const label = r.source_label ? ` «${r.source_label}»` : '';
      lines.push(`• ${r.source_chat_id}${label} → ${r.agent_name} (${r.agent_slug})`);
    }
    await ctx.reply(lines.join('\n'), { link_preview_options: { is_disabled: true } });
  });

  // /route <source_chat_id> <slug> — add/replace a route.
  bot.command('route', async (ctx) => {
    if (!isOwnerDm(ctx) || !agents) return;
    const parts = (ctx.match?.toString() ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      await ctx.reply('Использование: /route <source_chat_id> <slug>. Список агентов: /topics');
      return;
    }
    const sourceChatId = Number(parts[0]);
    const slug = parts[1]!.toLowerCase();
    if (!Number.isFinite(sourceChatId)) {
      await ctx.reply('source_chat_id должен быть числом. Список чатов: /chats');
      return;
    }
    const agent = agents.getBySlug(slug);
    if (!agent) {
      await ctx.reply(`Агент "${slug}" не найден. /topics — список.`);
      return;
    }
    const label = chats.listAll().find((c) => c.chat_id === sourceChatId)?.title ?? null;
    agents.upsertRoute(sourceChatId, agent.id, label);
    await ctx.reply(`✓ Чат ${sourceChatId} теперь маршрутизируется в «${agent.name}».`);
  });

  // /unroute <source_chat_id> — remove a route.
  bot.command('unroute', async (ctx) => {
    if (!isOwnerDm(ctx) || !agents) return;
    const arg = ctx.match?.toString().trim();
    const sourceChatId = Number(arg);
    if (!arg || !Number.isFinite(sourceChatId)) {
      await ctx.reply('Использование: /unroute <source_chat_id>');
      return;
    }
    agents.deleteRoute(sourceChatId);
    await ctx.reply(`✓ Маршрут для чата ${sourceChatId} удалён.`);
  });

  // Hint for first-time DMs from the owner. Doesn't override the
  // generic /start that the user sends to unblock the bot's outgoing
  // DMs — we just append our own help line after acknowledging.
  bot.command('start', async (ctx) => {
    if (!isOwnerDm(ctx)) return;
    await ctx.reply(
      `Бот готов. ${HELP_TEXT}`,
      { link_preview_options: { is_disabled: true } },
    );
  });
}

function parseWindowArg(raw: string | undefined, fallback: number): number | null {
  if (!raw || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 168) return null;
  return Math.round(n);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

// Parses `<free-form query> [--flag=value ...]`. Flags are stripped
// out of the query so the embedding only sees the actual semantic
// part. Unknown flags pass through silently.
interface MemoryArgs {
  query: string;
  chat?: string;
  source?: string;
  sinceIso?: string;
  limit?: number;
}
export function parseMemoryArgs(raw: string): MemoryArgs {
  const out: MemoryArgs = { query: '' };
  const tokens = raw.split(/\s+/).filter(Boolean);
  const queryTokens: string[] = [];
  for (const tok of tokens) {
    const m = tok.match(/^--(chat|source|since|limit)=(.+)$/);
    if (!m) {
      queryTokens.push(tok);
      continue;
    }
    const key = m[1]!;
    const value = m[2]!;
    if (key === 'chat') out.chat = value;
    else if (key === 'source') {
      if (value === 'tg-agent' || value === 'transcribe') out.source = value;
    } else if (key === 'since') {
      const ms = parseDuration(value);
      if (ms !== null) out.sinceIso = new Date(Date.now() - ms).toISOString();
    } else if (key === 'limit') {
      const n = Number(value);
      if (Number.isInteger(n) && n > 0 && n <= 50) out.limit = n;
    }
  }
  out.query = queryTokens.join(' ').trim();
  return out;
}

// Accepts "30m", "12h", "7d", "12h30m", "1d4h30m". Returns ms or null.
export function parseDuration(input: string): number | null {
  const re = /(\d+)\s*(d|h|m)/gi;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    matched = true;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = m[2]!.toLowerCase();
    if (unit === 'd') total += n * 86_400_000;
    else if (unit === 'h') total += n * 3_600_000;
    else if (unit === 'm') total += n * 60_000;
  }
  return matched ? total : null;
}

function sourceIconFor(source: string | null | undefined, kind: string | null | undefined): string {
  if (source === 'transcribe') {
    if (kind === 'summary') return '📝';
    if (kind === 'document') return '📄';
    return '🎙';
  }
  if (source === 'tg-agent') return '💬';
  return '·';
}

// Exported helper so tests can sanity-check the type narrowing.
export type OwnerDmContext = Filter<Context, 'message:text'>;
