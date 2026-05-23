// Daily per-chat markdown reporter — feeds the "Проекты" tab in admin.
//
// For each group chat the bot is in, writes five files into
// `<dataDir>/projects/<safe-chat-name>/`:
//   1-диалоги.md       message counts (all-time + today) + class breakdown + deals
//   2-участники.md     user roster with status + last activity
//   3-срочные-вопросы.md  buying/owner/price/support messages in the last 24h
//   4-рекомендации.md  heuristic recommendations from the same window
//   5-проблемы.md      heuristic problems (SPAM ratio, bot-commands, etc.)
//
// Plus a snapshot of files 1–3 to `archive/<YYYY-MM-DD>.md` so the
// admin "📂 Архив" tab can show day-over-day history.
//
// This used to live in `reporter.ts` before being removed in favor of
// the AI digest in `digest.ts`. The two complement each other now:
// digest = DM summary, reporter = browsable per-project artifacts.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ChatService } from './db/chats.js';
import type { DealService, DealRow } from './db/deals.js';
import type { Db } from './db/index.js';
import type { LeadService, UserRow } from './db/leads.js';
import type { Logger } from './logger.js';
import type { MessageClass } from './types.js';

export interface ReporterDeps {
  db: Db;
  chats: ChatService;
  leads: LeadService;
  deals: DealService;
  dataDir: string;
  logger: Logger;
  // UTC hour 0..23 when the daily sweep fires. Default 6 = 09:00 MSK.
  reportHourUtc?: number;
}

export interface ReporterHandle {
  stop(): void;
  runOnce(): Promise<void>;
}

// ── Scheduler ───────────────────────────────────────────────────────────────

export function startReportScheduler(deps: ReporterDeps): ReporterHandle {
  const { logger, reportHourUtc = 6 } = deps;
  let onceTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await runDailyReports(deps);
    } catch (err) {
      logger.error('reporter: daily sweep failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  };

  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), reportHourUtc, 0, 0, 0),
  );
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  const firstDelay = next.getTime() - now.getTime();
  onceTimer = setTimeout(() => {
    void tick();
    intervalTimer = setInterval(() => void tick(), 24 * 60 * 60 * 1000);
  }, firstDelay);
  logger.info('reporter scheduler armed', { nextRunAt: next.toISOString() });

  return {
    stop(): void {
      if (onceTimer) clearTimeout(onceTimer);
      if (intervalTimer) clearInterval(intervalTimer);
      onceTimer = null;
      intervalTimer = null;
    },
    async runOnce(): Promise<void> {
      if (!running) await tick();
    },
  };
}

// ── Core runner ─────────────────────────────────────────────────────────────

export async function runDailyReports(deps: ReporterDeps): Promise<void> {
  const { db, chats, leads, deals, dataDir, logger } = deps;
  const groups = chats.listGroups();

  if (groups.length === 0) {
    logger.info('reporter: no chats, skipping');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const dealsAll = deals.listAll();

  for (const g of groups) {
    const chatId = g.chat_id;
    const chatTitle = g.title ?? `chat_${chatId}`;
    const safeName = sanitizeFolderName(chatTitle);
    const dir = join(dataDir, 'projects', safeName);
    mkdirSync(dir, { recursive: true });

    const data = collectChatData(db, chatId, leads.listForChat(chatId), dealsAll);

    const file1 = buildDialogues(chatTitle, today, data);
    const file2 = buildUsers(chatTitle, today, data);
    const file3 = buildUrgent(chatTitle, today, data);
    const file4 = buildRecommendations(chatTitle, today, data);
    const file5 = buildProblems(chatTitle, today, data);

    writeFileSync(join(dir, '1-диалоги.md'), file1, 'utf8');
    writeFileSync(join(dir, '2-участники.md'), file2, 'utf8');
    writeFileSync(join(dir, '3-срочные-вопросы.md'), file3, 'utf8');
    writeFileSync(join(dir, '4-рекомендации.md'), file4, 'utf8');
    writeFileSync(join(dir, '5-проблемы.md'), file5, 'utf8');

    const archiveDir = join(dir, 'archive');
    mkdirSync(archiveDir, { recursive: true });
    const snapshot = [file1, file2, file3].join('\n\n---\n\n');
    writeFileSync(join(archiveDir, `${today}.md`), snapshot, 'utf8');

    logger.info('reporter: wrote chat report', {
      chatId,
      chatTitle,
      safeName,
      totalMessages: data.totalMessages,
      messagesToday: data.messagesToday,
    });
  }
}

// ── Data layer ──────────────────────────────────────────────────────────────

interface ClassRow {
  class: string | null;
  count: number;
}

interface UrgentRow {
  class: MessageClass;
  text: string;
  created_at: string;
  username: string | null;
}

interface ChatData {
  totalMessages: number;
  messagesToday: number;
  classBreakdownAll: ClassRow[];
  classBreakdownToday: ClassRow[];
  users: UserRow[];
  urgent: UrgentRow[];
  deals: DealRow[];
  spamCount: number;
  botCommandSpamCount: number;
  buyingIntent24h: number;
  priceRequest24h: number;
  ownerRequest24h: number;
  supportRequest24h: number;
}

function collectChatData(
  db: Db,
  chatId: number,
  users: UserRow[],
  dealsAll: DealRow[],
): ChatData {
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM tg_messages WHERE chat_id = ?`)
    .get(chatId) as { n: number };

  const todayCount = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tg_messages
       WHERE chat_id = ? AND created_at >= datetime('now', 'start of day')`,
    )
    .get(chatId) as { n: number };

  const classAll = db
    .prepare(
      `SELECT class, COUNT(*) AS count FROM tg_messages
       WHERE chat_id = ? AND class IS NOT NULL
       GROUP BY class ORDER BY count DESC`,
    )
    .all(chatId) as ClassRow[];

  const classToday = db
    .prepare(
      `SELECT class, COUNT(*) AS count FROM tg_messages
       WHERE chat_id = ? AND class IS NOT NULL
         AND created_at >= datetime('now', 'start of day')
       GROUP BY class ORDER BY count DESC`,
    )
    .all(chatId) as ClassRow[];

  const urgentClasses: MessageClass[] = [
    'BUYING_INTENT',
    'PRICE_REQUEST',
    'OWNER_REQUEST',
    'SUPPORT_REQUEST',
  ];
  const ph = urgentClasses.map(() => '?').join(',');
  const urgent = db
    .prepare(
      `SELECT m.class, m.text, m.created_at,
              (SELECT username FROM tg_users u
               WHERE u.chat_id = m.chat_id AND u.user_id = m.user_id) AS username
       FROM tg_messages m
       WHERE m.chat_id = ?
         AND m.class IN (${ph})
         AND m.created_at >= datetime('now', '-24 hours')
       ORDER BY m.created_at DESC
       LIMIT 20`,
    )
    .all(chatId, ...urgentClasses) as UrgentRow[];

  const buying24h = urgent.filter((r) => r.class === 'BUYING_INTENT').length;
  const price24h = urgent.filter((r) => r.class === 'PRICE_REQUEST').length;
  const owner24h = urgent.filter((r) => r.class === 'OWNER_REQUEST').length;
  const support24h = urgent.filter((r) => r.class === 'SUPPORT_REQUEST').length;

  const spamRow = classAll.find((c) => c.class === 'SPAM');
  const spamCount = spamRow ? spamRow.count : 0;

  // Bot-commands that the classifier misroutes into SPAM (begin with "/").
  const botCmdRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tg_messages
       WHERE chat_id = ? AND class = 'SPAM' AND text LIKE '/%'`,
    )
    .get(chatId) as { n: number };

  const dealsForChat = dealsAll.filter((d) => d.chat_id === chatId);

  return {
    totalMessages: total.n,
    messagesToday: todayCount.n,
    classBreakdownAll: classAll,
    classBreakdownToday: classToday,
    users,
    urgent,
    deals: dealsForChat,
    spamCount,
    botCommandSpamCount: botCmdRow.n,
    buyingIntent24h: buying24h,
    priceRequest24h: price24h,
    ownerRequest24h: owner24h,
    supportRequest24h: support24h,
  };
}

// ── Renderers ───────────────────────────────────────────────────────────────

function buildDialogues(title: string, today: string, d: ChatData): string {
  const lines: string[] = [];
  lines.push(`# 1. Количество диалогов · ${title}`);
  lines.push(`> Обновлено: ${today}`);
  lines.push('');
  lines.push(`## Всего сообщений: ${d.totalMessages}`);
  lines.push(`Сегодня: **+${d.messagesToday}**`);
  lines.push('');
  lines.push('## Разбивка по классу (всё время)');
  lines.push('');
  lines.push('| Класс | Кол-во |');
  lines.push('|---|---|');
  if (d.classBreakdownAll.length === 0) {
    lines.push('| — | — |');
  } else {
    for (const c of d.classBreakdownAll) lines.push(`| ${c.class ?? '—'} | ${c.count} |`);
  }
  lines.push('');
  lines.push('## Сегодня');
  lines.push('');
  lines.push('| Класс | Кол-во |');
  lines.push('|---|---|');
  if (d.classBreakdownToday.length === 0) {
    lines.push('— нет сообщений —');
  } else {
    for (const c of d.classBreakdownToday) lines.push(`| ${c.class ?? '—'} | ${c.count} |`);
  }
  lines.push('');
  lines.push(`## Сделки в CRM: ${d.deals.length}`);
  lines.push('');
  if (d.deals.length > 0) {
    lines.push('| Участник | Стадия | Сумма |');
    lines.push('|---|---|---|');
    for (const deal of d.deals) {
      const who = formatUser(deal.username, deal.first_name, deal.last_name, deal.user_id);
      const amount = deal.amount != null ? String(deal.amount) : '—';
      lines.push(`| ${who} | ${deal.stage} | ${amount} |`);
    }
  }
  return lines.join('\n') + '\n';
}

function buildUsers(title: string, today: string, d: ChatData): string {
  const lines: string[] = [];
  lines.push(`# 2. Участники · ${title}`);
  lines.push(`> Обновлено: ${today}`);
  lines.push('');
  lines.push(`**Всего: ${d.users.length}**`);
  lines.push('');
  lines.push('| # | User ID | @Логин | Имя | Статус | Последняя активность |');
  lines.push('|---|---|---|---|---|---|');
  d.users.forEach((u, i) => {
    const handle = u.username ? `@${u.username}` : '—';
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
    const seen = u.last_seen_at ? u.last_seen_at.slice(0, 16).replace('T', ' ') : '—';
    lines.push(`| ${i + 1} | ${u.user_id} | ${handle} | ${name} | ${u.status} | ${seen} |`);
  });
  lines.push('');
  lines.push('## Статусы');
  lines.push('| Статус | Смысл |');
  lines.push('|---|---|');
  lines.push('| new | Зафиксирован, не контактировал с ботом |');
  lines.push('| cold | Был в чате, но без коммерческого сигнала |');
  lines.push('| warm | Задавал вопросы / интересовался продуктом |');
  lines.push('| hot | Спрашивал цену / возражения, готов к закрытию |');
  lines.push('| buyer | Покупатель |');
  lines.push('| support | Обращался за помощью |');
  lines.push('| negative | Негативный сигнал (липкий, снимается вручную) |');
  return lines.join('\n') + '\n';
}

function buildUrgent(title: string, today: string, d: ChatData): string {
  const lines: string[] = [];
  lines.push(`# 3. Срочные вопросы · ${title}`);
  lines.push(`> Обновлено: ${today}`);
  lines.push('');
  lines.push(`## За последние 24 часа: ${d.urgent.length} сообщений`);
  lines.push('');
  if (d.urgent.length === 0) {
    lines.push('— нет срочных сообщений —');
  } else {
    for (const u of d.urgent) {
      const icon = urgentIcon(u.class);
      const ts = u.created_at.slice(0, 16);
      const who = u.username ? `@${u.username}` : 'unknown';
      lines.push(`### ${icon} ${u.class} · ${ts}`);
      lines.push(`> ${who}`);
      lines.push('');
      const snippet = u.text.replace(/\n/g, ' ').slice(0, 300);
      lines.push(`${snippet}`);
      lines.push('');
    }
  }
  lines.push('');
  lines.push('## Легенда');
  lines.push('- 🟢 BUYING_INTENT — готов купить, реагировать немедленно');
  lines.push('- 🟡 PRICE_REQUEST — спрашивает цену');
  lines.push('- 🔵 OWNER_REQUEST — обращается лично к тебе');
  lines.push('- 🔴 SUPPORT_REQUEST — нужна помощь/проблема');
  return lines.join('\n') + '\n';
}

function buildRecommendations(title: string, today: string, d: ChatData): string {
  const lines: string[] = [];
  lines.push(`# 4. Рекомендации · ${title}`);
  lines.push(`> Обновлено: ${today}`);
  lines.push('');

  let n = 1;
  if (d.buyingIntent24h > 0) {
    lines.push(
      `## ${n++}. **🟢 ${d.buyingIntent24h} лидов с намерением купить** — написали за последние 24ч, свяжись лично.`,
    );
  }
  if (d.priceRequest24h > 0) {
    lines.push(
      `## ${n++}. **🟡 ${d.priceRequest24h} запросов цены** — отправь прайс или КП.`,
    );
  }
  if (d.ownerRequest24h > 0) {
    lines.push(
      `## ${n++}. **🔵 ${d.ownerRequest24h} личных обращений** — тебя зовут по имени или тегают.`,
    );
  }
  if (d.supportRequest24h > 0) {
    lines.push(
      `## ${n++}. **🔴 ${d.supportRequest24h} запросов поддержки** — проверь, что бот ответил по делу.`,
    );
  }

  const hotUsers = d.users.filter((u) => u.status === 'hot' || u.status === 'buyer');
  if (hotUsers.length > 0) {
    lines.push(
      `## ${n++}. **${hotUsers.length} hot/buyer в воронке** — ${hotUsers
        .slice(0, 5)
        .map((u) => (u.username ? `@${u.username}` : `id${u.user_id}`))
        .join(', ')}${hotUsers.length > 5 ? '…' : ''}`,
    );
  }

  if (n === 1) {
    lines.push('— коммерческих сигналов за сутки нет —');
  }
  return lines.join('\n') + '\n';
}

function buildProblems(title: string, today: string, d: ChatData): string {
  const lines: string[] = [];
  lines.push(`# 5. Основные проблемы · ${title}`);
  lines.push(`> Обновлено: ${today}`);
  lines.push('');

  let n = 1;
  const spamRatio = d.totalMessages > 0 ? d.spamCount / d.totalMessages : 0;
  if (d.spamCount >= 10 && spamRatio > 0.1) {
    lines.push(
      `## ${n++}. 🟡 **Высокий SPAM** — ${d.spamCount} сообщений (${Math.round(
        spamRatio * 100,
      )}% от всех). Возможно, классификатор путает промо-контент с реальными сообщениями.`,
    );
  }

  if (d.botCommandSpamCount > 0) {
    lines.push(
      `## ${n++}. 🟢 **Команды других ботов в SPAM** — ${d.botCommandSpamCount} сообщений, начинающихся с "/", помечены как SPAM. Добавь в промпт: сообщения с "/" → BOT_COMMAND, IGNORE.`,
    );
  }

  const negativeUsers = d.users.filter((u) => u.status === 'negative');
  if (negativeUsers.length > 0) {
    lines.push(
      `## ${n++}. 🔴 **${negativeUsers.length} участников с negative** — проверь историю, возможно, бот ответил неудачно.`,
    );
  }

  const lowConfidenceCount = (
    d.classBreakdownAll.find((c) => c.class === null)?.count ?? 0
  );
  if (lowConfidenceCount > 0) {
    lines.push(
      `## ${n++}. 🟡 **${lowConfidenceCount} сообщений без класса** — классификатор отвалился (Anthropic API down или сообщение не текст).`,
    );
  }

  if (n === 1) {
    lines.push('— значимых проблем не найдено —');
  }
  return lines.join('\n') + '\n';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFolderName(s: string): string {
  return s
    .replace(/[^\wА-Яа-яЁёa-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function urgentIcon(cls: MessageClass): string {
  switch (cls) {
    case 'BUYING_INTENT':
      return '🟢';
    case 'PRICE_REQUEST':
      return '🟡';
    case 'OWNER_REQUEST':
      return '🔵';
    case 'SUPPORT_REQUEST':
      return '🔴';
    default:
      return '⚪';
  }
}

function formatUser(
  username: string | null,
  firstName: string | null,
  lastName: string | null,
  userId: number,
): string {
  const handle = username ? `@${username}` : null;
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (handle && name) return `${name} ${handle}`;
  if (handle) return handle;
  if (name) return name;
  return `id${userId}`;
}

export type { ChatData };
