// ═══════════════════════════════════════════════════════════════════
// handlers/subscription_expiry_check.js — daily cron sweep
// ───────────────────────────────────────────────────────────────────
// Two passes:
//   1. EXPIRE — active subs with expires_at < NOW() → status='expired'.
//      Send a polite "продлим?" message with invoice button.
//   2. REMIND — active subs expiring within 3 days, no reminder yet.
//      Send a heads-up + invoice button, mark reminder_sent_at=NOW().
//
// Idempotent: reminder_sent_at guards REMIND; status='active' guards
// EXPIRE. Two runs in the same day are safe — second is a no-op.
// ═══════════════════════════════════════════════════════════════════

import { query } from '../lib/db.js';
import { sendText } from '../lib/tg.js';
import { createInvoiceForPlan } from '../lib/billing.js';

const REMIND_WINDOW_DAYS = Number(process.env.SUBSCRIPTION_REMIND_DAYS ?? 3);

export async function handle(_job) {
  const expired = await sweepExpired();
  const reminded = await sweepReminders();
  return {
    ok: true,
    expired_count: expired.count,
    expired_user_ids: expired.userIds,
    reminded_count: reminded.count,
    reminded_user_ids: reminded.userIds,
  };
}

async function sweepExpired() {
  const rows = await query(
    `UPDATE platform_subscriptions s
        SET status = 'expired'
       FROM platform_users u
      WHERE s.user_id = u.id
        AND s.status = 'active'
        AND s.expires_at IS NOT NULL
        AND s.expires_at < NOW()
      RETURNING s.id, s.user_id, s.plan, u.tg_chat_id, u.name`,
  );

  for (const r of rows) {
    if (!r.tg_chat_id) continue;
    const inv = await createInvoiceForPlan({
      plan: r.plan,
      tg_chat_id: Number(r.tg_chat_id),
      note: `expired_renewal:${r.id}`,
    });
    const link = inv.ok ? inv.invoice_link : null;
    const greeting = r.name ? escapeHtml(r.name) : 'привет';
    const body =
      `<b>${greeting}</b>, подписка <b>${escapeHtml(r.plan.toUpperCase())}</b> закончилась — офис на паузе.\n\n` +
      (link
        ? `Продлить на 30 дней — <a href="${link}">оплатить здесь</a>.\nКоманда продолжит ровно с того места, где остановилась.`
        : `Продление настраиваем — напиши мне в ответ, оформлю вручную.`);
    await sendText(Number(r.tg_chat_id), body).catch(() => {});
  }

  return { count: rows.length, userIds: rows.map((r) => r.user_id) };
}

async function sweepReminders() {
  const rows = await query(
    `UPDATE platform_subscriptions s
        SET reminder_sent_at = NOW()
       FROM platform_users u
      WHERE s.user_id = u.id
        AND s.status = 'active'
        AND s.expires_at IS NOT NULL
        AND s.expires_at >= NOW()
        AND s.expires_at <  NOW() + ($1 || ' days')::interval
        AND s.reminder_sent_at IS NULL
      RETURNING s.id, s.user_id, s.plan, s.expires_at, u.tg_chat_id, u.name`,
    [String(REMIND_WINDOW_DAYS)],
  );

  for (const r of rows) {
    if (!r.tg_chat_id) continue;
    const inv = await createInvoiceForPlan({
      plan: r.plan,
      tg_chat_id: Number(r.tg_chat_id),
      note: `pre_expiry_reminder:${r.id}`,
    });
    const link = inv.ok ? inv.invoice_link : null;
    const daysLeft = Math.max(0, Math.ceil((new Date(r.expires_at) - new Date()) / 86400000));
    const greeting = r.name ? escapeHtml(r.name) : 'привет';
    const body =
      `<b>${greeting}</b>, подписка заканчивается через <b>${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}</b>.\n\n` +
      (link
        ? `Продлить заранее — <a href="${link}">${escapeHtml(r.plan.toUpperCase())}, оплатить</a>. Без паузы в команде.`
        : `Скоро откроем продление одной кнопкой. Если нужно сейчас — напиши.`);
    await sendText(Number(r.tg_chat_id), body).catch(() => {});
  }

  return { count: rows.length, userIds: rows.map((r) => r.user_id) };
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
