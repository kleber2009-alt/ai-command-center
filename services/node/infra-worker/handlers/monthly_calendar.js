// ═══════════════════════════════════════════════════════════════════
// handlers/monthly_calendar.js — Day-25 артефакт «календарь готов»
// ───────────────────────────────────────────────────────────────────
// Цель из journey memo: Day 25 от оплаты — клиент видит, что
// следующий месяц уже спланирован командой (loss aversion на renew).
//
// Триггер: system-wide cron (см. schedule_rules). Handler сам сканит
// platform_subscriptions: для каждой active sub со стажем ≥24 дней,
// у которой в deliverables нет monthly_calendar за последние 28 дней,
// генерирует и доставляет.
//
// Идемпотент через deliverables.kind проверку — два запуска в день
// не дублируют.
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { sendDeliverable } from '../lib/tg.js';

const MAX_TOKENS = 1400;
const MIN_AGE_DAYS = Number(process.env.MONTHLY_CALENDAR_MIN_AGE_DAYS ?? 24);
const COOLDOWN_DAYS = Number(process.env.MONTHLY_CALENDAR_COOLDOWN_DAYS ?? 28);

export async function handle(_job) {
  const candidates = await query(
    `SELECT u.id AS user_id, u.tg_chat_id, u.name, s.plan, s.expires_at, s.started_at,
            (SELECT MAX(created_at)
               FROM deliverables d
              WHERE d.user_id = u.id AND d.kind = 'monthly_calendar') AS last_sent
       FROM platform_users u
       JOIN platform_subscriptions s ON s.user_id = u.id
      WHERE u.tg_chat_id IS NOT NULL
        AND s.status = 'active'
        AND s.started_at <= NOW() - ($1 || ' days')::interval`,
    [String(MIN_AGE_DAYS)],
  );

  const targets = candidates.filter(c => {
    if (!c.last_sent) return true;
    const diffDays = (Date.now() - new Date(c.last_sent).getTime()) / 86400000;
    return diffDays >= COOLDOWN_DAYS;
  });

  if (targets.length === 0) {
    return { ok: true, scanned: candidates.length, delivered: 0 };
  }

  const delivered = [];
  for (const t of targets) {
    try {
      const out = await deliverFor(t);
      delivered.push(out);
    } catch (e) {
      delivered.push({ user_id: t.user_id, ok: false, error: e.message });
    }
  }
  return { ok: true, scanned: candidates.length, eligible: targets.length, delivered };
}

async function deliverFor(t) {
  const userName = t.name || 'друг';
  const planName = t.plan?.toUpperCase() || 'PRO';

  // Soft context — pulls last 5 used deliverables as flavor
  const recentUsed = await query(
    `SELECT title, kind FROM deliverables
      WHERE user_id = $1 AND used_at IS NOT NULL
      ORDER BY used_at DESC LIMIT 5`,
    [t.user_id],
  );
  const usedContextLine = recentUsed.length
    ? `Что уже зашло: ${recentUsed.map(r => `«${r.title}»`).join(', ')}.`
    : 'История пока пустая — это первый месячный календарь.';

  const expiresStr = t.expires_at ? new Date(t.expires_at).toISOString().slice(0, 10) : 'через неделю';

  const system = `Ты — Алиса 🎯, начальник AI-офиса. Клиент: ${userName}, подписка ${planName} активна до ${expiresStr}.

${usedContextLine}

Задача: написать короткое сообщение в Telegram — «календарь следующего месяца уже собран командой».
Условия:
- Тёплый, уверенный тон. Без маркетинга.
- 4-6 строк + блок из 4 недель (4 строки), каждая с фокус-темой и одним конкретным артефактом.
- На русском, без markdown (Telegram парсит сам HTML), макс 2 эмодзи.
- НЕ упоминай продление подписки прямо — пусть это видно через факт «месяц уже спланирован».
- Заверши строкой: «Если что-то поправить — скажи, перепланируем за вечер.»
- Без преамбулы. Сразу текст сообщения.`;

  const result = await chat({
    system,
    messages: [{ role: 'user', content: `Собери календарь следующего месяца — пришли в чат.` }],
    maxTokens: MAX_TOKENS,
  });
  if (!result.ok) return { user_id: t.user_id, ok: false, error: `claude: ${result.status} ${result.details?.slice(0, 150)}` };

  const body = result.text.trim().slice(0, 3000);

  const deliverable = await queryOne(
    `INSERT INTO deliverables
       (user_id, agent_id, agent_name, kind, title, body, metadata)
     VALUES ($1, 'specialized-chief-of-staff', 'Алиса', 'monthly_calendar',
             $2, $3, $4)
     RETURNING id`,
    [
      t.user_id,
      `Календарь на следующий месяц — Алиса`,
      body,
      JSON.stringify({
        tg_chat_id: Number(t.tg_chat_id),
        plan: t.plan,
        expires_at: t.expires_at,
        claude_usage: result.usage || null,
      }),
    ],
  );

  const prefix = `<b>Алиса 🎯</b>\n<i>Календарь следующего месяца собран</i>\n\n`;
  const tgRes = await sendDeliverable(Number(t.tg_chat_id), deliverable.id, prefix + escapeHtml(body));
  if (!tgRes.ok) {
    return { user_id: t.user_id, ok: false, error: `tg: ${tgRes.status || ''} ${tgRes.error?.slice(0, 150)}`, deliverable_id: deliverable.id };
  }

  const tgMsgId = tgRes.result?.message_id;
  if (tgMsgId) {
    await query(
      `UPDATE deliverables
          SET metadata = metadata || jsonb_build_object('tg_message_id', $1::int)
        WHERE id = $2`,
      [tgMsgId, deliverable.id],
    );
  }

  return { user_id: t.user_id, ok: true, deliverable_id: deliverable.id, tg_message_id: tgMsgId };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
