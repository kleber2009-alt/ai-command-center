// ═══════════════════════════════════════════════════════════════════
// lib/billing.js — Telegram Stars payments
// ───────────────────────────────────────────────────────────────────
// Flow:
//   1. createInvoiceForPlan(plan)
//        → INSERT payments(status='pending', invoice_payload=uuid)
//        → createInvoiceLink via Telegram Bot API (currency XTR)
//        → returns { invoice_link, payment_id, invoice_payload }
//   2. User opens link, sees Stars price, confirms.
//   3. Telegram sends pre_checkout_query → handlePreCheckout
//        → check payment row by payload → answerPreCheckoutQuery(ok)
//   4. Telegram delivers message.successful_payment → handleSuccessful
//        → UPDATE payments status='paid'
//        → upsert platform_users (by tg_chat_id) + activate platform_subscription
//        → INSERT scheduled_job kind='welcome_sequence' for immediate trigger
//
// All ops idempotent on tg_payment_charge_id and invoice_payload (UNIQUE).
// ═══════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto';
import { query, queryOne, withTx } from './db.js';

const TOKEN = process.env.TG_OFFICE_BOT_TOKEN || '';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

// ── Plan price lookup ─────────────────────────────────────────────
export async function getPlanPrice(plan) {
  return queryOne(
    'SELECT plan, price_stars, price_rub, display_name, duration_days FROM plan_prices WHERE plan = $1 AND active = TRUE',
    [plan],
  );
}

export async function listActivePlans() {
  return query(
    'SELECT plan, price_stars, price_rub, display_name, duration_days FROM plan_prices WHERE active = TRUE ORDER BY price_stars',
  );
}

// ── Step 1: create invoice ────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.plan
 * @param {number} [opts.tg_chat_id] — if known (e.g. user already linked); optional, payment will resolve it at successful_payment time
 * @param {string} [opts.note] — internal note saved to raw_update.invoice_note
 * @returns {Promise<{ok: true, invoice_link: string, payment_id: string, invoice_payload: string, plan: object} | {ok: false, error: string}>}
 */
export async function createInvoiceForPlan({ plan, tg_chat_id = null, note = null }) {
  if (!TOKEN) return { ok: false, error: 'TG_OFFICE_BOT_TOKEN missing' };
  const planRow = await getPlanPrice(plan);
  if (!planRow) return { ok: false, error: `unknown plan: ${plan}` };

  const payload = randomUUID();

  // Persist pending payment first (so race-free with TG callbacks)
  await query(
    `INSERT INTO payments (tg_chat_id, plan, amount_stars, invoice_payload, status, raw_update)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [
      // tg_chat_id is NOT NULL in schema; use 0 sentinel when unknown — replaced on successful_payment
      tg_chat_id || 0,
      plan,
      planRow.price_stars,
      payload,
      JSON.stringify({ invoice_note: note || null, created_with: 'createInvoiceForPlan' }),
    ],
  );

  const durationDays = Number(planRow.duration_days || 30);
  const periodLabel = durationDays >= 365 ? '12 месяцев' : durationDays >= 60 ? `${Math.round(durationDays/30)} месяцев` : '1 месяц';
  const title = planRow.display_name.slice(0, 32);
  const description =
    `Подписка ${plan.toUpperCase()} на ${periodLabel}.\n` +
    `Команда AI-агентов работает с тобой ежедневно.\n` +
    `Эквивалент ${planRow.price_rub} ₽.`.slice(0, 255);

  const res = await tgApi('createInvoiceLink', {
    title,
    description,
    payload,
    currency: 'XTR',
    provider_token: '', // empty for Telegram Stars
    prices: [{ label: planRow.display_name.slice(0, 32), amount: planRow.price_stars }],
  });

  if (!res.ok) {
    return { ok: false, error: `tg createInvoiceLink: ${res.status || ''} ${res.error?.slice(0, 200)}` };
  }

  return {
    ok: true,
    invoice_link: res.result, // string URL like https://t.me/$slugLink
    payment_id: payload,      // we use payload as the public correlation id
    invoice_payload: payload,
    plan: planRow,
  };
}

// ── Step 3: pre_checkout_query ────────────────────────────────────
export async function handlePreCheckout(cq) {
  const payload = String(cq.invoice_payload || '');
  if (!payload) {
    await tgApi('answerPreCheckoutQuery', { pre_checkout_query_id: cq.id, ok: false, error_message: 'Не передан payload.' });
    return;
  }

  const row = await queryOne(
    'SELECT id, status, amount_stars FROM payments WHERE invoice_payload = $1',
    [payload],
  );
  if (!row) {
    await tgApi('answerPreCheckoutQuery', { pre_checkout_query_id: cq.id, ok: false, error_message: 'Платёж не найден.' });
    return;
  }
  if (row.status !== 'pending') {
    await tgApi('answerPreCheckoutQuery', { pre_checkout_query_id: cq.id, ok: false, error_message: 'Платёж уже обработан.' });
    return;
  }
  if (Number(cq.total_amount) !== Number(row.amount_stars)) {
    await tgApi('answerPreCheckoutQuery', { pre_checkout_query_id: cq.id, ok: false, error_message: 'Сумма не совпадает.' });
    return;
  }

  await tgApi('answerPreCheckoutQuery', { pre_checkout_query_id: cq.id, ok: true });
}

// ── Step 4: successful_payment ────────────────────────────────────
/**
 * @param {object} msg — Telegram Message containing successful_payment
 * @returns {Promise<{ok: boolean, user_id?: string, subscription_id?: string, welcome_job_id?: string, error?: string}>}
 */
export async function handleSuccessfulPayment(msg) {
  const sp = msg?.successful_payment;
  if (!sp) return { ok: false, error: 'no successful_payment in message' };

  const tgChatId = msg.chat?.id;
  const tgUserId = msg.from?.id;
  const firstName = msg.from?.first_name || null;
  const username = msg.from?.username || null;
  const payload = String(sp.invoice_payload || '');
  const tgChargeId = String(sp.telegram_payment_charge_id || '');
  const providerChargeId = String(sp.provider_payment_charge_id || '');

  if (!payload || !tgChatId) {
    return { ok: false, error: 'missing payload or chat_id' };
  }

  return withTx(async (client) => {
    // Idempotency: if this charge already marked paid, no-op
    const dup = await client.query(
      'SELECT id, status FROM payments WHERE tg_payment_charge_id = $1',
      [tgChargeId],
    );
    if (dup.rows[0]?.status === 'paid') {
      return { ok: true, idempotent: true, payment_id: dup.rows[0].id };
    }

    // Find pending payment row
    const r = await client.query(
      `SELECT p.id, p.plan, p.amount_stars, COALESCE(pr.duration_days, 30) AS duration_days
         FROM payments p
         LEFT JOIN plan_prices pr ON pr.plan = p.plan
        WHERE p.invoice_payload = $1 AND p.status = $2 FOR UPDATE`,
      [payload, 'pending'],
    );
    if (r.rows.length === 0) {
      // Could be: refunded, failed, or unknown
      return { ok: false, error: 'pending payment not found for payload ' + payload };
    }
    const pay = r.rows[0];

    if (Number(sp.total_amount) !== Number(pay.amount_stars)) {
      await client.query(
        `UPDATE payments SET status='failed', raw_update = raw_update || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ error: 'amount_mismatch', sp }), pay.id],
      );
      return { ok: false, error: 'amount_mismatch' };
    }

    // Mark paid
    await client.query(
      `UPDATE payments
          SET status = 'paid', tg_chat_id = $1, paid_at = NOW(),
              tg_payment_charge_id = $2, provider_payment_charge_id = $3,
              raw_update = $4::jsonb
        WHERE id = $5`,
      [tgChatId, tgChargeId, providerChargeId, JSON.stringify(sp), pay.id],
    );

    // Upsert platform_user by tg_chat_id (or fallback create with synthetic email)
    let userRow = await client.query(
      'SELECT id, name, email FROM platform_users WHERE tg_chat_id = $1',
      [tgChatId],
    );
    let userId;
    if (userRow.rows[0]) {
      userId = userRow.rows[0].id;
    } else {
      // No existing user — create synthetic email so we can later merge by real one
      const syntheticEmail = `tg${tgUserId || tgChatId}@telegram.local`;
      const ins = await client.query(
        `INSERT INTO platform_users (email, name, tg_chat_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET tg_chat_id = EXCLUDED.tg_chat_id, name = COALESCE(platform_users.name, EXCLUDED.name)
         RETURNING id`,
        [syntheticEmail, firstName || username || 'Гость', tgChatId],
      );
      userId = ins.rows[0].id;
    }

    // Activate (or extend) subscription
    // Extends expires_at by plan_prices.duration_days (30 for monthly,
    // 365 for *_year plans). Base = max(NOW, current expires_at).
    const durationDays = Number(pay.duration_days || 30);
    const subRow = await client.query(
      `SELECT id, expires_at FROM platform_subscriptions
        WHERE user_id = $1 AND plan = $2 AND status = 'active'
        ORDER BY started_at DESC LIMIT 1`,
      [userId, pay.plan],
    );

    let subscriptionId;
    if (subRow.rows[0]) {
      const base = subRow.rows[0].expires_at && new Date(subRow.rows[0].expires_at) > new Date()
        ? subRow.rows[0].expires_at
        : new Date();
      const ext = new Date(base);
      ext.setDate(ext.getDate() + durationDays);
      const upd = await client.query(
        `UPDATE platform_subscriptions
            SET expires_at = $1, last_payment_id = $2, price_stars = $3,
                reminder_sent_at = NULL
          WHERE id = $4 RETURNING id`,
        [ext.toISOString(), pay.id, pay.amount_stars, subRow.rows[0].id],
      );
      subscriptionId = upd.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO platform_subscriptions
           (user_id, plan, status, started_at, expires_at, last_payment_id, price_stars)
         VALUES ($1, $2, 'active', NOW(), NOW() + ($3 || ' days')::interval, $4, $5)
         RETURNING id`,
        [userId, pay.plan, String(durationDays), pay.id, pay.amount_stars],
      );
      subscriptionId = ins.rows[0].id;
    }

    // Trigger welcome_sequence within 8 seconds (gives some breathing room)
    const welcomePayload = {
      tg_chat_id: tgChatId,
      user_name: firstName || username || 'друг',
      user_context: `Новый клиент только что оформил подписку ${pay.plan.toUpperCase()} за ${pay.amount_stars} Stars. Контекст из анкеты онбординга пока не собран — представь команду тепло, опираясь на тот факт, что клиент только что доверил тебе деньги.`,
      office_lead: { id: 'specialized-chief-of-staff', name: 'Алиса', emoji: '🎯' },
      teammates: ['Аня', 'Игорь', 'Лена', 'Лёша', 'Софья', 'Артём', 'Маша', 'Олег', 'Даша', 'Тимур'],
    };
    const jobIns = await client.query(
      `INSERT INTO scheduled_jobs (kind, user_id, scheduled_at, status, payload)
       VALUES ('welcome_sequence', $1, NOW() + interval '8 seconds', 'pending', $2)
       RETURNING id`,
      [userId, JSON.stringify(welcomePayload)],
    );

    return {
      ok: true,
      payment_id: pay.id,
      user_id: userId,
      subscription_id: subscriptionId,
      welcome_job_id: jobIns.rows[0].id,
    };
  });
}

// ── Step 5: refund handling ───────────────────────────────────────
//
// Two entry points:
//  · handleRefundedPayment(msg)  — webhook update message.refunded_payment
//  · refundByChargeId({tg_payment_charge_id, user_id?})
//                                — admin-triggered: calls Telegram
//                                  refundStarPayment then idempotently
//                                  updates DB. user_id required for the
//                                  TG API call (sent by initial payer).
//
// Side effects (both paths):
//  · payments.status = 'refunded', paid_at unchanged
//  · linked platform_subscription gets status = 'refunded'
//  · sends a polite TG note to the user
//
// Idempotent: re-running on already-refunded payments is a no-op.

/**
 * @param {object} msg — Telegram Message containing refunded_payment
 */
export async function handleRefundedPayment(msg) {
  const rp = msg?.refunded_payment;
  if (!rp) return { ok: false, error: 'no refunded_payment in message' };
  const tgChatId = msg.chat?.id;
  const tgChargeId = String(rp.telegram_payment_charge_id || '');
  if (!tgChargeId) return { ok: false, error: 'missing tg_payment_charge_id' };

  return refundDbWriteAndNotify({ tgChargeId, tgChatIdFallback: tgChatId, source: 'webhook', rawUpdate: rp });
}

/**
 * Initiate a refund via Telegram Bot API + record DB.
 * @param {object} opts
 * @param {string} opts.tg_payment_charge_id
 * @param {number} [opts.user_id] — TG user id of the original payer; if omitted, looked up from payments row
 */
export async function refundByChargeId({ tg_payment_charge_id, user_id }) {
  if (!TOKEN) return { ok: false, error: 'TG_OFFICE_BOT_TOKEN missing' };
  if (!tg_payment_charge_id) return { ok: false, error: 'tg_payment_charge_id required' };

  const pay = await queryOne(
    `SELECT id, user_id, tg_chat_id, status FROM payments WHERE tg_payment_charge_id = $1`,
    [tg_payment_charge_id],
  );
  if (!pay) return { ok: false, error: 'payment not found' };
  if (pay.status === 'refunded') return { ok: true, idempotent: true, payment_id: pay.id };

  const payerId = user_id || (pay.tg_chat_id ? Number(pay.tg_chat_id) : null);
  if (!payerId) return { ok: false, error: 'payer user_id unknown — pass user_id explicitly' };

  const tgRes = await tgApi('refundStarPayment', {
    user_id: payerId,
    telegram_payment_charge_id: tg_payment_charge_id,
  });
  if (!tgRes.ok) {
    return { ok: false, error: `tg refundStarPayment: ${tgRes.status || ''} ${tgRes.error?.slice(0, 200)}` };
  }

  return refundDbWriteAndNotify({
    tgChargeId: tg_payment_charge_id,
    tgChatIdFallback: pay.tg_chat_id ? Number(pay.tg_chat_id) : null,
    source: 'admin',
  });
}

async function refundDbWriteAndNotify({ tgChargeId, tgChatIdFallback, source, rawUpdate }) {
  return withTx(async (client) => {
    const r = await client.query(
      `SELECT id, user_id, tg_chat_id, plan, status FROM payments
        WHERE tg_payment_charge_id = $1 FOR UPDATE`,
      [tgChargeId],
    );
    if (r.rows.length === 0) return { ok: false, error: 'payment row not found' };
    const pay = r.rows[0];
    if (pay.status === 'refunded') return { ok: true, idempotent: true, payment_id: pay.id };

    await client.query(
      `UPDATE payments
          SET status = 'refunded',
              raw_update = COALESCE(raw_update, '{}'::jsonb) ||
                           jsonb_build_object('refund', $1::jsonb,
                                              'refund_source', $2::text,
                                              'refunded_at', NOW()::text)
        WHERE id = $3`,
      [JSON.stringify(rawUpdate || {}), source, pay.id],
    );

    let subRowId = null;
    if (pay.user_id) {
      const sub = await client.query(
        `UPDATE platform_subscriptions
            SET status = 'refunded'
          WHERE last_payment_id = $1 AND status = 'active'
          RETURNING id`,
        [pay.id],
      );
      subRowId = sub.rows[0]?.id || null;
    }

    const chatId = pay.tg_chat_id ? Number(pay.tg_chat_id) : tgChatIdFallback;
    if (chatId) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text:
          'Вернул оплату — увидишь её на балансе Stars в течение нескольких минут.\n\n' +
          'Если что-то пошло не так и нужно продлить доступ — просто напиши, разберёмся.',
      }).catch(() => {});
    }

    return { ok: true, payment_id: pay.id, subscription_id: subRowId, plan: pay.plan };
  });
}

// ── TG API ────────────────────────────────────────────────────────
async function tgApi(method, payload) {
  if (!TOKEN) return { ok: false, error: 'no_token' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, error: body.slice(0, 400) };
    }
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Reserved for future thank-you message after successful_payment
void PUBLIC_BASE;
