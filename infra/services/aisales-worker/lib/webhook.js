// ═══════════════════════════════════════════════════════════════════
// lib/webhook.js — Fastify routes for the AI Growth Office bot
// ───────────────────────────────────────────────────────────────────
// Handles two kinds of inbound Telegram updates:
//   1. callback_query "d:used:<id>" / "d:nope:<id>"
//      → records feedback on a deliverable (basis for WFDS metric)
//      → acks button + edits the original message
//   2. /start command
//      → links chat_id to platform_users if email/username matches
//      → otherwise sends a friendly hint
// ═══════════════════════════════════════════════════════════════════

import { query, queryOne } from './db.js';
import { createInvoiceForPlan, handlePreCheckout, handleSuccessfulPayment, listActivePlans, handleRefundedPayment, refundByChargeId } from './billing.js';
import { cloneVoice } from './voice.js';
import {
  confirmFounderTaskLocal,
  fetchFounderPlanSnapshot,
  founderPlanKeyboard,
  requestFounderTaskProdApproval,
  renderFounderPlanMessage,
  listFounderPriorityTasks,
} from './founder_plan.js';
import * as parserBot from './parser_bot.js';

const EXPECTED_SECRET = process.env.TG_OFFICE_WEBHOOK_SECRET || '';
const TOKEN = process.env.TG_OFFICE_BOT_TOKEN || '';
const OWNER_TELEGRAM_ID = Number(process.env.OWNER_TELEGRAM_ID || 0);
const OFFICE_HQ_BASE_URL = (process.env.OFFICE_HQ_BASE_URL || '').replace(/\/+$/, '');
const OFFICE_HQ_WEB_URL = (process.env.OFFICE_HQ_WEB_URL || OFFICE_HQ_BASE_URL || '').replace(/\/+$/, '');
const OFFICE_HQ_TIMEOUT_MS = Math.max(1000, Number(process.env.OFFICE_HQ_TIMEOUT_MS || 7000));
const OFFICE_HQ_VIEWS = {
  '/hq': 'snapshot',
  '/brief': 'brief',
  '/standup': 'standup',
  '/focus': 'focus',
  '/escalations': 'escalations',
  '/decide': 'decisions',
};
const OFFICE_HQ_VIEW_LABELS = {
  snapshot: 'Штаб',
  brief: 'Бриф',
  standup: 'Планерка',
  focus: 'Фокус',
  escalations: 'Риски',
  decisions: 'Решения',
};
const OFFICE_HQ_KIND_LABELS = {
  chief_of_staff: 'Шеф штаба',
  product: 'Продукт',
  growth: 'Рост',
  research: 'Ресерч',
  sales: 'Продажи',
  support: 'Поддержка',
  ops: 'Операции',
  finance: 'Финансы',
};
const OFFICE_HQ_DECISION_STATUSES = {
  approved: 'Одобрить',
  deferred: 'Отложить',
  rejected: 'Отклонить',
};
const OFFICE_HQ_OPTION_LABELS = {
  pause_24h: 'пауза 24 часа',
  keep_running: 'оставить как есть',
  shift_focus: 'сместить фокус',
  split_focus: 'разделить фокус',
  manual_takeover: 'ручной перехват',
  draft_reply_only: 'только черновик ответа',
  let_ai_continue: 'дать ИИ продолжить',
  ship_prod: 'выкатить в прод',
  hold_local: 'оставить на локали',
  none: 'без рекомендации',
};
const OWNER_HQ_COMMANDS = [
  { command: 'hq', description: 'Обзор офиса' },
  { command: 'plan', description: 'План дня от штаба' },
  { command: 'brief', description: 'Короткий бриф по офису' },
  { command: 'standup', description: 'Ежедневная планерка' },
  { command: 'focus', description: 'Главный фокус команды' },
  { command: 'escalations', description: 'Эскалации и блокеры' },
  { command: 'decide', description: 'Решения, которые ждут тебя' },
];

export function registerWebhook(fastify) {
  // Health endpoint for quick sanity checks
  fastify.get('/worker/health', async () => ({
    ok: true,
    tg: Boolean(TOKEN),
    secret_set: Boolean(EXPECTED_SECRET),
  }));

  // ── /worker/wfds — founder dashboard ────────────────────────────
  // North-star метрика: WFDS (Weekly Founder Deliverables Shipped) =
  // используемые артефакты за 7 дней. Renders HTML by default; JSON if
  // Accept: application/json.
  fastify.get('/worker/wfds', async (request, reply) => {
    const wantJson = (request.headers.accept || '').includes('application/json');

    const agg7 = await query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE used_at IS NOT NULL) AS used
         FROM deliverables WHERE delivered_at >= NOW() - interval '7 days'`,
    );
    const agg30 = await query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE used_at IS NOT NULL) AS used
         FROM deliverables WHERE delivered_at >= NOW() - interval '30 days'`,
    );
    const byKind = await query(
      `SELECT kind, COUNT(*) AS total, COUNT(*) FILTER (WHERE used_at IS NOT NULL) AS used
         FROM deliverables
        WHERE delivered_at >= NOW() - interval '30 days'
        GROUP BY kind ORDER BY total DESC`,
    );
    const topUsers = await query(
      `SELECT u.name, u.tg_chat_id, u.email,
              COUNT(d.*) AS total,
              COUNT(d.*) FILTER (WHERE d.used_at IS NOT NULL) AS used,
              MAX(d.delivered_at) AS last_delivered
         FROM platform_users u
         LEFT JOIN deliverables d ON d.user_id = u.id
           AND d.delivered_at >= NOW() - interval '30 days'
        WHERE u.tg_chat_id IS NOT NULL
        GROUP BY u.id ORDER BY used DESC NULLS LAST, total DESC LIMIT 20`,
    );
    const activeSubs = await query(
      `SELECT plan, COUNT(*) AS count
         FROM platform_subscriptions WHERE status = 'active'
        GROUP BY plan ORDER BY count DESC`,
    );

    const w7 = { total: Number(agg7[0]?.total || 0), used: Number(agg7[0]?.used || 0) };
    const w30 = { total: Number(agg30[0]?.total || 0), used: Number(agg30[0]?.used || 0) };

    if (wantJson) {
      return { ok: true, wfds_7d: w7.used, agg_7d: w7, agg_30d: w30, by_kind: byKind, top_users: topUsers, active_subs: activeSubs };
    }

    reply.type('text/html; charset=utf-8');
    return renderWfdsHtml({ w7, w30, byKind, topUsers, activeSubs });
  });

  // ── /worker/viral-clone/dispatch ──────────────────────────────────
  // Принимает POST от transcribe webhook'а (apps/transcribe), чтобы
  // /clone-команда из @your_transscribe_bot создавала viral_pipelines
  // в БД `aisales`. Защита — shared secret в заголовке.
  fastify.post('/worker/viral-clone/dispatch', async (request, reply) => {
    const expected = process.env.VIRAL_CLONE_DISPATCH_SECRET || '';
    if (!expected) {
      return reply.code(503).send({ ok: false, error: 'dispatch_disabled' });
    }
    const got = request.headers['x-dispatch-secret'];
    if (got !== expected) {
      return reply.code(401).send({ ok: false, error: 'bad_secret' });
    }
    const body = request.body || {};
    const chatId = Number(body.chat_id);
    const sourceUrl = typeof body.source_url === 'string' ? body.source_url.trim() : null;
    const competitor = typeof body.competitor_account === 'string' ? body.competitor_account.trim() : null;
    if (!Number.isFinite(chatId) || (!sourceUrl && !competitor)) {
      return reply.code(400).send({ ok: false, error: 'chat_id + (source_url|competitor_account) required' });
    }
    // Если знаем Telegram-id юзера — попробуем привязать к platform_user.
    let userId = null;
    if (body.user_telegram_id) {
      const u = await queryOne(
        'SELECT id FROM platform_users WHERE tg_chat_id = $1',
        [Number(body.user_telegram_id)],
      );
      userId = u?.id || null;
    }

    const pipeline = await queryOne(
      `INSERT INTO viral_pipelines
         (user_id, tg_chat_id, competitor_account, source_url, stage)
       VALUES ($1, $2, $3, $4, 'init')
       RETURNING id`,
      [userId, chatId, competitor, sourceUrl],
    );
    await query(
      `INSERT INTO scheduled_jobs (kind, scheduled_at, status, payload)
       VALUES ('viral_clone', NOW(), 'pending', $1::jsonb)`,
      [JSON.stringify({ pipeline_id: pipeline.id })],
    );

    return { ok: true, pipeline_id: pipeline.id };
  });

  // Public billing endpoints — used by landing/dashboard
  fastify.get('/worker/billing/plans', async () => {
    const plans = await listActivePlans();
    return { ok: true, plans };
  });

  // ── /worker/billing/status?payment_id=X — poll endpoint for the
  // post-click success overlay on pricing.html. CORS-allowed.
  fastify.get('/worker/billing/status', async (request, reply) => {
    const paymentId = String(request.query?.payment_id || '');
    if (!paymentId || paymentId.length < 8) {
      return reply.code(400).send({ ok: false, error: 'payment_id required' });
    }
    const row = await queryOne(
      `SELECT id, status, plan, paid_at FROM payments
        WHERE invoice_payload = $1 OR id::text = $1
        LIMIT 1`,
      [paymentId],
    );
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
    return reply.send({
      ok: true,
      payment_id: row.id,
      status: row.status,
      plan: row.plan,
      paid_at: row.paid_at,
    });
  });

  fastify.post('/worker/billing/invoice', async (request, reply) => {
    const body = request.body || {};
    if (!body.plan || typeof body.plan !== 'string') {
      return reply.code(400).send({ ok: false, error: 'plan is required' });
    }
    const tgChatId = body.tg_chat_id ? Number(body.tg_chat_id) : null;
    const result = await createInvoiceForPlan({
      plan: body.plan,
      tg_chat_id: tgChatId,
      note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
    });
    if (!result.ok) return reply.code(400).send(result);
    return reply.send({
      ok: true,
      invoice_link: result.invoice_link,
      payment_id: result.payment_id,
      plan: result.plan,
    });
  });

  // ── /worker/billing/refund — admin-initiated refund ──────────────
  // Защита: shared secret в заголовке (тот же TG_OFFICE_WEBHOOK_SECRET).
  // POST {tg_payment_charge_id, user_id?} → Telegram refundStarPayment +
  // payments.status='refunded' + subscription revoke + notify.
  fastify.post('/worker/billing/refund', async (request, reply) => {
    const got = request.headers['x-admin-secret'];
    if (!EXPECTED_SECRET || got !== EXPECTED_SECRET) {
      return reply.code(401).send({ ok: false, error: 'bad_secret' });
    }
    const body = request.body || {};
    if (!body.tg_payment_charge_id) {
      return reply.code(400).send({ ok: false, error: 'tg_payment_charge_id required' });
    }
    const out = await refundByChargeId({
      tg_payment_charge_id: String(body.tg_payment_charge_id),
      user_id: body.user_id ? Number(body.user_id) : undefined,
    });
    if (!out.ok) return reply.code(400).send(out);
    return reply.send(out);
  });

  // ── /worker/voice/clone ──────────────────────────────────────────
  // Принимает аудио-сэмпл (base64) из онбординга → ElevenLabs IVC →
  // сохраняет voice_id. Если юзер ещё не привязан к platform_users
  // (онбординг был до оплаты), кладём в pending_voice_clones —
  // welcome_sequence перенесёт оттуда после оплаты.
  fastify.post('/worker/voice/clone', async (request, reply) => {
    const body = request.body || {};
    if (typeof body.audio_b64 !== 'string' || body.audio_b64.length < 100) {
      return reply.code(400).send({ ok: false, error: 'audio_b64 required (base64-encoded audio sample, ≥30 sec recommended)' });
    }
    const audioMime = typeof body.audio_mime === 'string' ? body.audio_mime : 'audio/webm';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 255) || null : null;
    const tgChatId = body.tg_chat_id ? Number(body.tg_chat_id) : null;
    const userName = typeof body.name === 'string' ? body.name.slice(0, 64) : 'AI Growth Office user';

    let audioBuffer;
    try {
      audioBuffer = Buffer.from(body.audio_b64, 'base64');
    } catch {
      return reply.code(400).send({ ok: false, error: 'invalid base64' });
    }

    const cloneRes = await cloneVoice({
      audioBuffer,
      audioMime,
      name: `${userName} · ${new Date().toISOString().slice(0, 10)}`,
    });
    if (!cloneRes.ok) {
      return reply.code(cloneRes.status || 502).send(cloneRes);
    }

    const voiceId = cloneRes.voice_id;
    let linkedUserId = null;
    if (email || tgChatId) {
      const u = await queryOne(
        `SELECT id FROM platform_users
          WHERE ($1::text IS NOT NULL AND email = $1)
             OR ($2::bigint IS NOT NULL AND tg_chat_id = $2)
          LIMIT 1`,
        [email, tgChatId],
      );
      if (u?.id) {
        await query('UPDATE platform_users SET voice_id = $1 WHERE id = $2', [voiceId, u.id]);
        linkedUserId = u.id;
      } else {
        await query(
          `INSERT INTO pending_voice_clones (email, tg_chat_id, voice_id, name)
           VALUES ($1, $2, $3, $4)`,
          [email, tgChatId, voiceId, userName],
        );
      }
    }

    return reply.send({ ok: true, voice_id: voiceId, linked_user_id: linkedUserId });
  });

  fastify.post('/worker/tg-webhook', async (request, reply) => {
    // Verify secret (Telegram sends back what we set via setWebhook)
    if (EXPECTED_SECRET) {
      const got = request.headers['x-telegram-bot-api-secret-token'];
      if (got !== EXPECTED_SECRET) {
        request.log.warn({ got: got ? 'present' : 'missing' }, 'webhook bad secret');
        return reply.code(401).send({ ok: false, error: 'bad_secret' });
      }
    }

    const update = request.body || {};

    try {
      if (update.callback_query) {
        await handleCallback(update.callback_query);
      } else if (update.pre_checkout_query) {
        await handlePreCheckout(update.pre_checkout_query);
      } else if (update.message?.successful_payment) {
        const out = await handleSuccessfulPayment(update.message);
        request.log.info({ out }, 'successful_payment processed');
        await handlePaymentThankYou(update.message, out);
      } else if (update.message?.refunded_payment) {
        const out = await handleRefundedPayment(update.message);
        request.log.info({ out }, 'refunded_payment processed');
      } else if (update.message?.text) {
        const t = update.message.text.trim();
        if (detectFounderPlanCommand(t) && isOwnerHqMessage(update.message)) {
          await handleFounderPlanCommand(update.message);
        } else if (detectOfficeHqView(t) && isOwnerHqMessage(update.message)) {
          await handleOfficeHqCommand(update.message);
        } else if (t === '/start' || t.startsWith('/start ')) {
          await handleStart(update.message);
        } else if (t === '/clone' || t.startsWith('/clone ') || t.startsWith('/clone@')) {
          await handleClone(update.message);
        } else if (t === '/discover' || t.startsWith('/discover ') || t.startsWith('/discover@')) {
          await handleDiscover(update.message);
        } else if (t === '/discover_setup' || t.startsWith('/discover_setup ')) {
          await handleDiscoverSetup(update.message);
        } else if (t === '/discover_targets' || t === '/discover_list') {
          await handleDiscoverTargets(update.message);
        } else if (t.startsWith('/discover_add ') || t.startsWith('/discover_remove ')) {
          await handleDiscoverEditTarget(update.message);
        } else {
          await handleMessage(update.message);
        }
      }
    } catch (e) {
      // Never 500 to TG — it will retry forever. Log and ack.
      request.log.error({ err: e.message, stack: e.stack?.slice(0, 500) }, 'webhook handler crash');
    }

    return reply.send({ ok: true });
  });

  // ─── PARSER BOT webhook (отдельный bot @your_parser_bot) ─────────
  // Полностью отдельный flow от Office bot: своя state-machine (lib/parser_bot.js),
  // свой webhook secret. Подключается через setWebhook параметром secret_token.
  const PARSER_SECRET = process.env.TG_PARSER_WEBHOOK_SECRET || '';
  fastify.post('/worker/parser-webhook', async (request, reply) => {
    if (PARSER_SECRET) {
      const got = request.headers['x-telegram-bot-api-secret-token'];
      if (got !== PARSER_SECRET) {
        request.log.warn({ got: got ? 'present' : 'missing' }, 'parser-webhook bad secret');
        return reply.code(401).send({ ok: false, error: 'bad_secret' });
      }
    }
    const update = request.body || {};
    try {
      if (update.callback_query) {
        await parserBot.handleCallback(update.callback_query);
      } else if (update.message?.text) {
        const t = update.message.text.trim();
        if (t === '/start' || t.startsWith('/start ')) {
          await parserBot.handleStart(update.message);
        } else {
          await parserBot.handleText(update.message);
        }
      }
    } catch (e) {
      request.log.error({ err: e.message, stack: e.stack?.slice(0, 500) }, 'parser-webhook crash');
    }
    return reply.send({ ok: true });
  });
}

async function handlePaymentThankYou(msg, out) {
  if (!out?.ok || out.idempotent) return;
  const chatId = msg.chat?.id;
  if (!chatId) return;
  await tgApi('sendMessage', {
    chat_id: chatId,
    text:
      '✅ <b>Оплата принята</b>\n\n' +
      'Алиса (начальник офиса) представится через несколько секунд и расскажет, что команда уже подготовила для тебя.',
    parse_mode: 'HTML',
  });
}

// ═══ Callback queries ════════════════════════════════════════════════
async function handleCallback(cq) {
  const data = String(cq.data || '');
  if (data.startsWith('plan:')) {
    await handleFounderPlanCallback(cq);
    return;
  }
  if (data.startsWith('hq:')) {
    await handleOfficeHqCallback(cq);
    return;
  }
  if (!data.startsWith('d:')) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }
  const [, action, deliverableId] = data.split(':');
  if (!deliverableId) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Не понял' });
    return;
  }

  let usedKind, ackText, footerLine;
  if (action === 'used') {
    usedKind = 'used';
    ackText = '✓ Записал, спасибо!';
    footerLine = '\n\n— использовано ✅';
  } else if (action === 'nope') {
    usedKind = 'not_useful';
    ackText = '👍 Учту, в следующий раз перепишу';
    footerLine = '\n\n— отмечено как непригодное';
  } else {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  // Idempotent: only set used_at on first tap
  const updated = await query(
    `UPDATE deliverables
        SET used_at = NOW(),
            used_kind = $1
      WHERE id = $2
        AND used_at IS NULL
      RETURNING id`,
    [usedKind, deliverableId],
  );

  if (updated.length === 0) {
    // Already marked — gentle ack
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Уже отмечено' });
    return;
  }

  await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: ackText });

  // Strip buttons + append footer to the original message
  const msg = cq.message;
  if (msg?.chat?.id && msg?.message_id) {
    const baseText = (msg.text || '') + footerLine;
    await tgApi('editMessageText', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: baseText,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });
  }
}

// ═══ /start — link chat_id to platform_user if possible ═════════════
async function handleStart(msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || msg.from?.username || 'друг';

  if (isOwnerHqMessage(msg)) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: buildOfficeHqIntro(firstName),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: officeHqKeyboard('snapshot'),
    });
    return;
  }

  // Already linked?
  const linked = await queryOne(
    'SELECT id, name FROM platform_users WHERE tg_chat_id = $1',
    [chatId],
  );
  if (linked) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `С возвращением, ${escapeHtml(linked.name || firstName)} ✨\n\nКоманда продолжает работать. Утренние планёрки приходят в будни в 11:30 (Мск).`,
      parse_mode: 'HTML',
    });
    return;
  }

  // Welcome screen for an unknown chat — no auto-linking by username
  // (security: someone else's TG username could match a real user).
  await tgApi('sendMessage', {
    chat_id: chatId,
    text:
      `Привет, ${escapeHtml(firstName)} 👋\n\n` +
      'Я — бот команды <b>AI Growth Office</b>. Здесь утренние планёрки от твоих агентов.\n\n' +
      'Сервис в pre-launch. Чтобы связать твой Telegram с аккаунтом — оставь заявку на ' +
      '<a href="https://ai-office.46-62-215-11.nip.io/">ai-office.46-62-215-11.nip.io</a>, ' +
      'и мы подключим тебя вручную.\n\n' +
      `<i>chat_id: ${chatId}</i>`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

function isOwnerHqMessage(msg) {
  return isOwnerHqChat(msg?.chat, msg?.from?.id);
}

function isOwnerHqChat(chat, userId) {
  return Boolean(
    chat?.type === 'private' &&
    OWNER_TELEGRAM_ID &&
    Number(userId) === OWNER_TELEGRAM_ID,
  );
}

function normalizeCommand(text) {
  const raw = String(text || '').trim().split(/\s+/, 1)[0] || '';
  return raw.toLowerCase().replace(/@[^/\s]+$/, '');
}

function detectOfficeHqView(text) {
  const command = normalizeCommand(text);
  return OFFICE_HQ_VIEWS[command] || null;
}

function detectFounderPlanCommand(text) {
  return normalizeCommand(text) === '/plan';
}

function parseFounderPlanCallback(data) {
  if (!data.startsWith('plan:')) return null;
  const parts = data.split(':');
  if (parts[1] === 'refresh') return { action: 'refresh' };
  if (parts[1] === 'local') return { action: 'local', id: parts[2] || '' };
  if (parts[1] === 'prod') return { action: 'prod', id: parts[2] || '' };
  return null;
}

function parseOfficeHqCallback(data) {
  if (!data.startsWith('hq:')) return null;
  const parts = data.split(':');
  if (parts[1] === 'act') {
    return { action: 'decision', status: parts[2] || '', id: parts[3] || '' };
  }
  if (parts[1] === 'refresh') {
    return { action: 'refresh', view: parts[2] || 'snapshot' };
  }
  return { action: 'view', view: parts[1] || 'snapshot' };
}

function officeHqViewTitle(view) {
  return OFFICE_HQ_VIEW_LABELS[view] || 'HQ';
}

function officeHqOptionLabel(value) {
  if (!value) return 'без рекомендации';
  return OFFICE_HQ_OPTION_LABELS[value] || String(value).replaceAll('_', ' ');
}

function officeHqRoleEmoji(kind) {
  switch (kind) {
    case 'chief_of_staff': return '🎯';
    case 'product': return '🧩';
    case 'growth': return '📈';
    case 'research': return '🧠';
    case 'sales': return '💼';
    case 'support': return '🤝';
    case 'ops': return '🛠';
    case 'finance': return '💳';
    default: return '•';
  }
}

function officeHqToneEmoji(tone) {
  switch (tone) {
    case 'critical': return '🔴';
    case 'warning': return '🟠';
    case 'good': return '🟢';
    default: return '🔵';
  }
}

function officeHqFormatClock(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return 'только что';
  return date.toISOString().slice(11, 16) + ' UTC';
}

function officeHqDecisionActionRows(snapshot) {
  const queue = Array.isArray(snapshot?.decisionQueue) ? snapshot.decisionQueue : [];
  const firstPending = queue.find((decision) => decision.status === 'pending');
  if (!firstPending?.id) return [];

  return [[
    { text: OFFICE_HQ_DECISION_STATUSES.approved, callback_data: `hq:act:approved:${firstPending.id}` },
    { text: OFFICE_HQ_DECISION_STATUSES.deferred, callback_data: `hq:act:deferred:${firstPending.id}` },
    { text: OFFICE_HQ_DECISION_STATUSES.rejected, callback_data: `hq:act:rejected:${firstPending.id}` },
  ]];
}

function officeHqKeyboard(activeView, snapshot) {
  const navRows = [
    ['snapshot', 'brief', 'standup'],
    ['focus', 'escalations', 'decisions'],
  ].map((row) => row.map((view) => ({
    text: activeView === view ? `• ${officeHqViewTitle(view)}` : officeHqViewTitle(view),
    callback_data: `hq:${view}`,
  })));

  const webButtons = [];
  if (OFFICE_HQ_WEB_URL) {
    webButtons.push({ text: 'Открыть штаб', url: `${OFFICE_HQ_WEB_URL}/office/hq` });
    webButtons.push({ text: 'Открыть решения', url: `${OFFICE_HQ_WEB_URL}/office/decisions` });
  }

  const rows = [
    ...navRows,
    ...(activeView === 'decisions' ? officeHqDecisionActionRows(snapshot) : []),
    [{ text: 'Обновить', callback_data: `hq:refresh:${activeView}` }],
  ];
  if (webButtons.length) rows.push(webButtons);

  return { inline_keyboard: rows };
}

function buildOfficeHqIntro(firstName) {
  const lines = [
    `<b>Штаб AI Growth Office</b>`,
    `Привет, ${escapeHtml(firstName)}.`,
    '',
    'Теперь ты общаешься не с разрозненными агентами, а с одним штабом.',
    '',
    '<b>Команды штаба</b>',
    '/plan - утренний план дня с локальным и прод-апрувом',
    '/hq - общий штаб и состояние команды',
    '/brief - короткий бриф для основателя',
    '/standup - статус всех ролей',
    '/focus - главный фокус недели',
    '/escalations - риски и блокеры',
    '/decide - очередь решений',
  ];
  if (OFFICE_HQ_WEB_URL) {
    lines.push('', `Веб-офис: ${escapeHtml(`${OFFICE_HQ_WEB_URL}/office/hq`)}`);
  }
  return lines.join('\n');
}

async function fetchOfficeHqSnapshot() {
  if (!OFFICE_HQ_BASE_URL) {
    return { ok: false, error: 'OFFICE_HQ_BASE_URL is not set' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFFICE_HQ_TIMEOUT_MS);

  try {
    const url = new URL('/api/office/hq', OFFICE_HQ_BASE_URL);
    url.searchParams.set('view', 'snapshot');
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `HQ API ${res.status}` };
    }
    if (!data?.summary || !data?.cards) {
      return { ok: false, error: data?.error || 'HQ snapshot missing summary/cards' };
    }
    return {
      ok: true,
      snapshot: data,
    };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'HQ API timeout' : (error?.message || String(error)) };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateOfficeHqDecision({ id, status, snapshot }) {
  if (!OFFICE_HQ_BASE_URL) {
    return { ok: false, error: 'OFFICE_HQ_BASE_URL is not set' };
  }

  const decision = Array.isArray(snapshot?.decisionQueue)
    ? snapshot.decisionQueue.find((item) => item.id === id)
    : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFFICE_HQ_TIMEOUT_MS);

  try {
    const url = new URL('/api/office/decisions', OFFICE_HQ_BASE_URL);
    const res = await fetch(url, {
      method: 'PATCH',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id,
        status,
        actorId: 'telegram-hq',
        selectedOptionKey: status === 'approved' ? decision?.recommended || null : null,
        resolutionNote:
          status === 'approved'
            ? 'Решение одобрено из Telegram HQ.'
            : status === 'deferred'
              ? 'Решение отложено из Telegram HQ.'
              : 'Решение отклонено из Telegram HQ.',
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `Decision API ${res.status}` };
    }

    return { ok: true, payload: data };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'AbortError' ? 'Истек таймаут обновления решения' : (error?.message || String(error)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function splitTelegramText(text, maxLength = 3500) {
  const chunks = [];
  let rest = String(text || '').trim();
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf('\n\n', maxLength);
    if (cut < maxLength * 0.5) cut = rest.lastIndexOf('\n', maxLength);
    if (cut < maxLength * 0.5) cut = rest.lastIndexOf(' ', maxLength);
    if (cut < maxLength * 0.5) cut = maxLength;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.length ? chunks : [''];
}

function officeHqWebPath(view) {
  if (!OFFICE_HQ_WEB_URL) return '';
  if (view === 'decisions') return `${OFFICE_HQ_WEB_URL}/office/decisions`;
  return `${OFFICE_HQ_WEB_URL}/office/hq`;
}

function fallbackTeamFromSnapshot(snapshot) {
  const roster = [
    { slug: 'chief-of-staff', name: 'Шеф штаба', kind: 'chief_of_staff', roleLabel: 'Шеф штаба' },
    { slug: 'product-agent', name: 'Продукт', kind: 'product', roleLabel: 'Продукт' },
    { slug: 'growth-agent', name: 'Рост', kind: 'growth', roleLabel: 'Рост' },
    { slug: 'research-agent', name: 'Ресерч', kind: 'research', roleLabel: 'Ресерч' },
    { slug: 'sales-agent', name: 'Продажи', kind: 'sales', roleLabel: 'Продажи' },
    { slug: 'support-agent', name: 'Поддержка', kind: 'support', roleLabel: 'Поддержка' },
    { slug: 'ops-agent', name: 'Операции', kind: 'ops', roleLabel: 'Операции' },
    { slug: 'finance-agent', name: 'Финансы', kind: 'finance', roleLabel: 'Финансы' },
  ];
  return roster.map((member, index) => {
    let statusTone = 'active';
    let statusLabel = 'В рабочем ритме';
    let focusLabel = snapshot.summary?.weeklyFocus || 'Идет по штатному ритму';
    if (member.kind === 'chief_of_staff') {
      statusTone = snapshot.summary?.pendingDecisions > 0 ? 'warning' : 'good';
      statusLabel = snapshot.summary?.pendingDecisions > 0 ? `${snapshot.summary.pendingDecisions} решений ждут апрува` : 'Синхронизирован';
      focusLabel = 'Готовит бриф и рекомендации для основателя';
    } else if (member.kind === 'ops') {
      statusTone = snapshot.summary?.criticalAlerts > 0 ? 'critical' : 'good';
      statusLabel = snapshot.summary?.criticalAlerts > 0 ? `${snapshot.summary.criticalAlerts} активных алертов` : 'Инфра стабильна';
      focusLabel = 'Следит за инцидентами, очередями и доставкой';
    } else if (member.kind === 'sales') {
      statusTone = snapshot.summary?.pendingDecisions > 0 ? 'warning' : 'good';
      statusLabel = snapshot.summary?.pendingDecisions > 0 ? 'Есть горячие эпизоды' : 'Воронка под контролем';
      focusLabel = 'Следит за горячими лидами и зависшими повторными касаниями';
    } else if (index < 4) {
      statusLabel = 'Активен';
      focusLabel = snapshot.summary?.weeklyFocus || 'Ведет свою зону';
    }
    return {
      slug: member.slug,
      name: member.name,
      kind: member.kind,
      roleLabel: member.roleLabel,
      statusTone,
      statusLabel,
      focusLabel,
    };
  });
}

function officeHqTeam(snapshot) {
  return Array.isArray(snapshot.team) && snapshot.team.length ? snapshot.team : fallbackTeamFromSnapshot(snapshot);
}

function formatOfficeHqList(items, emptyLabel, limit = 5) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const chosen = safeItems.slice(0, limit);
  if (!chosen.length) return [`- ${escapeHtml(emptyLabel)}`];
  return chosen.map((item) => `- ${escapeHtml(item)}`);
}

function renderOfficeHqOverview(snapshot) {
  const team = officeHqTeam(snapshot).slice(0, 6);
  return [
    '<b>Штаб AI Growth Office</b>',
    `<i>${snapshot.fallback ? 'РЕЗЕРВ' : 'БОЕВОЙ РЕЖИМ'} · обновлено ${officeHqFormatClock(snapshot.generatedAt)}</i>`,
    '',
    `<b>Сейчас:</b> ${snapshot.summary.activeAgents} агентов · ${snapshot.summary.openTasks} задач · ${snapshot.summary.pendingDecisions} решений · ${snapshot.summary.criticalAlerts} алертов`,
    `<b>Фокус недели:</b> ${escapeHtml(snapshot.summary.weeklyFocus)}`,
    '',
    '<b>Штабная доска</b>',
    ...team.map((member) =>
      `${officeHqRoleEmoji(member.kind)} <b>${escapeHtml(member.roleLabel || OFFICE_HQ_KIND_LABELS[member.kind] || member.name)}</b> · ${officeHqToneEmoji(member.statusTone)} ${escapeHtml(member.statusLabel)}`
    ),
    '',
    '<b>Что штаб рекомендует сейчас</b>',
    ...formatOfficeHqList(snapshot.cards?.recommendations, 'Сейчас явных рекомендаций нет.', 3),
  ].join('\n');
}

function renderOfficeHqBrief(snapshot) {
  return [
    '<b>Краткий бриф</b>',
    `<i>Обновлено ${officeHqFormatClock(snapshot.generatedAt)}</i>`,
    '',
    `<b>Ситуация:</b> ${escapeHtml(snapshot.cards?.situation || 'Нет краткой сводки по ситуации.')}`,
    '',
    '<b>Что изменилось</b>',
    ...formatOfficeHqList(snapshot.cards?.changed, 'Крупных изменений не зафиксировано.', 4),
    '',
    '<b>Риски</b>',
    ...formatOfficeHqList(snapshot.cards?.risks, 'Прямо сейчас срочных рисков нет.', 4),
    '',
    '<b>Что требует твоего решения</b>',
    ...formatOfficeHqList(snapshot.cards?.decisions, 'Нет решений в ожидании.', 4),
    '',
    '<b>Следующие действия по владельцам</b>',
    ...formatOfficeHqList(snapshot.cards?.nextActions, 'Срочных действий в очереди нет.', 4),
  ].join('\n');
}

function renderOfficeHqStandup(snapshot) {
  const team = officeHqTeam(snapshot);
  return [
    '<b>Планерка команды</b>',
    `<i>Отчитываются ${snapshot.summary.activeAgents} агентов</i>`,
    '',
    ...team.map((member) =>
      `${officeHqRoleEmoji(member.kind)} <b>${escapeHtml(member.roleLabel || member.name)}</b> · ${officeHqToneEmoji(member.statusTone)} ${escapeHtml(member.statusLabel)}\n${escapeHtml(member.focusLabel || member.mission || 'Ведет свою зону')}`
    ),
  ].join('\n\n');
}

function renderOfficeHqFocus(snapshot) {
  return [
    '<b>Фокус недели</b>',
    '',
    `<b>Фокус недели:</b> ${escapeHtml(snapshot.summary.weeklyFocus)}`,
    '',
    '<b>Что штаб защищает на этой неделе</b>',
    ...formatOfficeHqList(snapshot.cards?.recommendations, 'Явных защитных ходов не зафиксировано.', 5),
    '',
    '<b>Очередь P0 / на апрув</b>',
    ...formatOfficeHqList(snapshot.cards?.nextActions, 'Задач P0 в очереди нет.', 5),
  ].join('\n');
}

function renderOfficeHqEscalations(snapshot) {
  return [
    '<b>Эскалации</b>',
    '',
    `<b>Критических алертов:</b> ${escapeHtml(String(snapshot.summary.criticalAlerts))}`,
    '',
    '<b>Активные риски</b>',
    ...formatOfficeHqList(snapshot.cards?.risks, 'Сейчас эскалаций нет.', 5),
    '',
    '<b>Как работает эскалация</b>',
    snapshot.summary.criticalAlerts > 0
      ? '- Операции и шеф штаба ведут критические вопросы прямо в внимание основателя.'
      : '- Некритичные вопросы остаются внутри обычного цикла офиса.',
  ].join('\n');
}

function renderOfficeHqDecisions(snapshot) {
  const queue = Array.isArray(snapshot.decisionQueue) ? snapshot.decisionQueue : [];
  return [
    '<b>Входящие решения</b>',
    '',
    `<b>Ждут апрува:</b> ${escapeHtml(String(snapshot.summary.pendingDecisions))}`,
    '',
    ...formatOfficeHqList(snapshot.cards?.decisions, 'Нет решений в ожидании.', 6),
    ...(queue[0]
      ? [
          '',
          `<b>Первое решение для действия:</b> ${escapeHtml(queue[0].title)}`,
          `Рекомендация: <code>${escapeHtml(officeHqOptionLabel(queue[0].recommended))}</code>`,
        ]
      : []),
    '',
    ...formatOfficeHqList(snapshot.cards?.recommendations, 'Отдельной рекомендации не приложено.', 3),
  ].join('\n');
}

function renderOfficeHqMessage(snapshot, view) {
  switch (view) {
    case 'brief':
      return renderOfficeHqBrief(snapshot);
    case 'standup':
      return renderOfficeHqStandup(snapshot);
    case 'focus':
      return renderOfficeHqFocus(snapshot);
    case 'escalations':
      return renderOfficeHqEscalations(snapshot);
    case 'decisions':
      return renderOfficeHqDecisions(snapshot);
    case 'snapshot':
    default:
      return renderOfficeHqOverview(snapshot);
  }
}

function trimTelegramHtml(text, maxLength = 3900) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 32).trimEnd() + '\n\n<i>Открой веб-офис для полной версии.</i>';
}

async function handleFounderPlanCommand(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const snapshotResult = await fetchFounderPlanSnapshot();
  if (!snapshotResult.ok) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `План дня пока недоступен.\n\nПричина: ${snapshotResult.error}`.slice(0, 3800),
      disable_web_page_preview: true,
    });
    return;
  }

  const tasks = await listFounderPriorityTasks(3);
  const text = trimTelegramHtml(renderFounderPlanMessage(snapshotResult.snapshot, tasks));
  await tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: founderPlanKeyboard(tasks),
  });
}

async function handleFounderPlanCallback(cq) {
  if (!isOwnerHqChat(cq.message?.chat, cq.from?.id)) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'План доступен только владельцу.' });
    return;
  }

  const parsed = parseFounderPlanCallback(String(cq.data || ''));
  if (!parsed) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  if (parsed.action === 'local') {
    const result = await confirmFounderTaskLocal(parsed.id, `telegram:${cq.from?.id || 'owner'}`);
    if (!result.ok) {
      await tgApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: result.error === 'task_not_found' ? 'Задача не найдена.' : 'Не удалось подтвердить локальный шаг.',
        show_alert: false,
      });
      return;
    }
  }

  if (parsed.action === 'prod') {
    const result = await requestFounderTaskProdApproval(parsed.id, `telegram:${cq.from?.id || 'owner'}`);
    if (!result.ok) {
      const text =
        result.error === 'local_confirmation_required'
          ? 'Сначала подтверди локальный шаг.'
          : result.error === 'task_not_found'
            ? 'Задача не найдена.'
            : 'Не удалось запросить прод-апрув.';
      await tgApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text,
        show_alert: false,
      });
      return;
    }
  }

  const snapshotResult = await fetchFounderPlanSnapshot();
  if (!snapshotResult.ok) {
    await tgApi('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: `Не удалось обновить план: ${snapshotResult.error}`.slice(0, 180),
      show_alert: false,
    });
    return;
  }

  const tasks = await listFounderPriorityTasks(3);
  const text = trimTelegramHtml(renderFounderPlanMessage(snapshotResult.snapshot, tasks));
  const edit = await tgApi('editMessageText', {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: founderPlanKeyboard(tasks),
  });

  if (!edit?.ok && !/message is not modified/i.test(String(edit?.error || ''))) {
    await tgApi('sendMessage', {
      chat_id: cq.message.chat.id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: founderPlanKeyboard(tasks),
    });
  }

  const notice =
    parsed.action === 'local'
      ? 'Задача взята в локальную работу.'
      : parsed.action === 'prod'
        ? 'Прод-апрув отправлен в решения.'
        : 'План обновлен.';

  await tgApi('answerCallbackQuery', {
    callback_query_id: cq.id,
    text: notice,
  });
}

async function handleOfficeHqCommand(msg) {
  const chatId = msg.chat?.id;
  const view = detectOfficeHqView(msg.text);
  if (!chatId || !view) return;

  const result = await fetchOfficeHqSnapshot();
  if (!result.ok) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text:
        'HQ временно недоступен.\n\n' +
        `Причина: ${result.error}\n` +
        (OFFICE_HQ_WEB_URL ? `Веб-офис: ${OFFICE_HQ_WEB_URL}/office/hq` : ''),
      disable_web_page_preview: true,
    });
    return;
  }

  const snapshot = result.snapshot;
  const payload = trimTelegramHtml(renderOfficeHqMessage(snapshot, view));
  await tgApi('sendMessage', {
    chat_id: chatId,
    text: payload,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: officeHqKeyboard(view, snapshot),
  });
}

async function handleOfficeHqCallback(cq) {
  if (!isOwnerHqChat(cq.message?.chat, cq.from?.id)) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Панель HQ доступна только владельцу.' });
    return;
  }

  const parsed = parseOfficeHqCallback(String(cq.data || ''));
  if (!parsed) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  const result = await fetchOfficeHqSnapshot();
  if (!result.ok) {
    await tgApi('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: `HQ недоступен: ${result.error}`.slice(0, 180),
      show_alert: false,
    });
    return;
  }

  let snapshot = result.snapshot;
  let view = parsed.view === 'help' ? 'snapshot' : parsed.view;

  if (parsed.action === 'decision') {
    const status = parsed.status;
    if (!parsed.id || !Object.prototype.hasOwnProperty.call(OFFICE_HQ_DECISION_STATUSES, status)) {
      await tgApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Не понял действие по решению.',
      });
      return;
    }

    const actionResult = await updateOfficeHqDecision({ id: parsed.id, status, snapshot });
    if (!actionResult.ok) {
      await tgApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `Не удалось обновить решение: ${actionResult.error}`.slice(0, 180),
        show_alert: false,
      });
      return;
    }

    const refreshed = await fetchOfficeHqSnapshot();
    if (!refreshed.ok) {
      await tgApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Решение обновлено, но HQ не успел перезагрузиться.',
      });
      return;
    }
    snapshot = refreshed.snapshot;
    view = 'decisions';
  }

  const text = trimTelegramHtml(renderOfficeHqMessage(snapshot, view));
  const edit = await tgApi('editMessageText', {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: officeHqKeyboard(view, snapshot),
  });

  if (!edit?.ok && /message is not modified/i.test(String(edit?.error || ''))) {
    await tgApi('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: `Уже открыт режим «${officeHqViewTitle(view)}».`,
    });
    return;
  }

  if (!edit?.ok) {
    await tgApi('sendMessage', {
      chat_id: cq.message.chat.id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: officeHqKeyboard(view, snapshot),
    });
  }

  const notice =
    parsed.action === 'refresh'
      ? 'HQ обновлен.'
      : parsed.action === 'decision'
        ? `Решение: ${OFFICE_HQ_DECISION_STATUSES[parsed.status]}`
        : officeHqViewTitle(view);
  await tgApi('answerCallbackQuery', {
    callback_query_id: cq.id,
    text: notice,
  });
}

async function handleMessage(_msg) {
  // No conversational handler yet — silent ignore.
}

// ═══ /clone <url|@handle> — kick off viral_clone pipeline ═════════════
//
// Two trigger forms:
//   /clone https://www.instagram.com/reel/XXXX/   — конкретный рилс
//   /clone @competitor_account                    — найти топ-рилс через Apify
//
// Создаём строку в viral_pipelines + сразу пушим первый scheduled_jobs
// (kind='viral_clone'). Дальше работает state-machine handler.
async function handleClone(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  // Сохраняем строку текста после команды.
  const raw = String(msg.text || '').trim();
  const arg = raw.replace(/^\/clone(@\S+)?\s*/i, '').trim();

  if (!arg) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text:
        '🎬 <b>Клон рилса</b>\n\n' +
        'Использование:\n' +
        '<code>/clone https://www.instagram.com/reel/XXXX/</code>\n' +
        '<code>/clone @competitor_account</code> — найдём самый «залетевший» рилс за последние 30 дней.\n\n' +
        '<i>Файл с готовым видео придёт в этот чат через ~3–7 минут (HeyGen + Submagic — асинхронные).</i>',
      parse_mode: 'HTML',
    });
    return;
  }

  let sourceUrl = null;
  let competitorAccount = null;
  if (/^https?:\/\//i.test(arg)) {
    sourceUrl = arg.split(/\s+/)[0];
  } else if (/^@?[A-Za-z0-9._]{2,}$/.test(arg)) {
    competitorAccount = arg.startsWith('@') ? arg : '@' + arg;
  } else {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'Не понял аргумент. Жду либо ссылку (https://…), либо @handle. Пример: <code>/clone @somebody</code>',
      parse_mode: 'HTML',
    });
    return;
  }

  // Привязка к platform_users — нужен для контекста Claude и WFDS.
  const linked = await queryOne(
    'SELECT id, name FROM platform_users WHERE tg_chat_id = $1',
    [chatId],
  );

  const pipeline = await queryOne(
    `INSERT INTO viral_pipelines
       (user_id, tg_chat_id, competitor_account, source_url, stage)
     VALUES ($1, $2, $3, $4, 'init')
     RETURNING id`,
    [linked?.id || null, chatId, competitorAccount, sourceUrl],
  );

  await query(
    `INSERT INTO scheduled_jobs (kind, scheduled_at, status, payload)
     VALUES ('viral_clone', NOW(), 'pending', $1::jsonb)`,
    [JSON.stringify({ pipeline_id: pipeline.id })],
  );

  await tgApi('sendMessage', {
    chat_id: chatId,
    text:
      '🎬 Поставил в работу.\n\n' +
      `Источник: <code>${escapeHtml(sourceUrl || competitorAccount)}</code>\n` +
      `Pipeline: <code>${pipeline.id}</code>\n\n` +
      '<i>Шаги: research → download → transcribe → rewrite → HeyGen → Submagic → отправка файлом сюда.</i>',
    parse_mode: 'HTML',
  });
}

// ═══ /discover · ежедневный парсер залетевших постов ═════════════════
//
// /discover                    — запустить прямо сейчас (создаёт scheduled_job)
// /discover_setup <ниша>       — записать niche_description в config
// /discover_targets            — показать текущий список источников
// /discover_add @account       — добавить аккаунт-конкурента
// /discover_add #hashtag       — добавить хэштег
// /discover_remove @account    — удалить из списка
//
// Все команды требуют привязки chat_id к platform_user (через /start
// на лендинге или вручную через ops). Если нет привязки — короткий хинт.

async function handleDiscover(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const linked = await queryOne(
    `SELECT u.id, u.name,
            c.user_id IS NOT NULL AS has_config,
            c.competitors, c.hashtags, c.niche_description, c.enabled
       FROM platform_users u
       LEFT JOIN viral_discover_configs c ON c.user_id = u.id
      WHERE u.tg_chat_id = $1`,
    [chatId],
  );
  if (!linked) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'Сначала привяжи аккаунт через /start.',
      parse_mode: 'HTML',
    });
    return;
  }

  if (!linked.has_config || !linked.niche_description) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text:
        '🔎 <b>Парсер ниши не настроен.</b>\n\n' +
        '1) Опиши свою нишу:\n<code>/discover_setup коуч по продажам B2B для собственников</code>\n\n' +
        '2) Добавь источники:\n<code>/discover_add @competitor</code>\n<code>/discover_add #salescoaching</code>\n\n' +
        '3) Запусти: <code>/discover</code>\n\nПо умолчанию буду присылать каждое утро в 08:00 МСК.',
      parse_mode: 'HTML',
    });
    return;
  }

  const totalTargets = (linked.competitors?.length || 0) + (linked.hashtags?.length || 0);
  if (totalTargets === 0) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text:
        'Список источников пуст. Добавь хотя бы один:\n' +
        '<code>/discover_add @account</code> или <code>/discover_add #hashtag</code>',
      parse_mode: 'HTML',
    });
    return;
  }

  // Сразу пушим scheduled_jobs — handler возьмёт его в ближайший jobTick.
  await query(
    `INSERT INTO scheduled_jobs (kind, user_id, scheduled_at, status, payload)
     VALUES ('viral_discover', $1, NOW(), 'pending', $2::jsonb)`,
    [linked.id, JSON.stringify({ user_id: linked.id, tg_chat_id: chatId, force: true })],
  );

  await tgApi('sendMessage', {
    chat_id: chatId,
    text:
      '🔎 Поставил в работу: скрейплю ' +
      `${linked.competitors?.length || 0} аккаунтов + ${linked.hashtags?.length || 0} хэштегов.\n` +
      'Результат с топ-5 рилсами и топ-5 каруселями придёт сюда через 1-3 минуты.',
    parse_mode: 'HTML',
  });
}

async function handleDiscoverSetup(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const niche = String(msg.text || '').replace(/^\/discover_setup\s*/i, '').trim();
  if (!niche) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'Использование:\n<code>/discover_setup коуч по продажам B2B, аудитория — собственники малого бизнеса</code>',
      parse_mode: 'HTML',
    });
    return;
  }

  const linked = await queryOne(
    'SELECT id, name FROM platform_users WHERE tg_chat_id = $1',
    [chatId],
  );
  if (!linked) {
    await tgApi('sendMessage', { chat_id: chatId, text: 'Сначала привяжи аккаунт через /start.' });
    return;
  }

  await query(
    `INSERT INTO viral_discover_configs (user_id, tg_chat_id, niche_description)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET niche_description = EXCLUDED.niche_description,
           tg_chat_id = EXCLUDED.tg_chat_id,
           enabled = TRUE`,
    [linked.id, chatId, niche.slice(0, 1000)],
  );

  await tgApi('sendMessage', {
    chat_id: chatId,
    text:
      '✓ Ниша записана.\n\n' +
      'Теперь добавь источники:\n' +
      '<code>/discover_add @account</code> — аккаунт-конкурент\n' +
      '<code>/discover_add #hashtag</code> — хэштег\n\n' +
      'Когда добавишь — запусти <code>/discover</code>.',
    parse_mode: 'HTML',
  });
}

async function handleDiscoverTargets(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const cfg = await queryOne(
    `SELECT c.competitors, c.hashtags, c.niche_description, c.enabled,
            c.posted_within_days
       FROM viral_discover_configs c
       JOIN platform_users u ON u.id = c.user_id
      WHERE u.tg_chat_id = $1`,
    [chatId],
  );
  if (!cfg) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'Конфиг ещё не создан. Начни с <code>/discover_setup</code>.',
      parse_mode: 'HTML',
    });
    return;
  }

  const competitors = cfg.competitors || [];
  const hashtags = cfg.hashtags || [];
  const lines = [];
  lines.push(`<b>🔎 Парсер ниши</b> · ${cfg.enabled ? 'включён' : 'выключен'}`);
  lines.push('');
  lines.push(`<b>Ниша:</b> ${escapeHtml(cfg.niche_description || '— (используй /discover_setup)')}`);
  lines.push(`<b>Окно:</b> ${cfg.posted_within_days} дней`);
  lines.push('');
  lines.push(`<b>Аккаунты (${competitors.length}):</b>`);
  if (competitors.length === 0) lines.push('  — пусто (добавь /discover_add @handle)');
  else competitors.forEach((c) => lines.push(`  • ${escapeHtml(c)}`));
  lines.push('');
  lines.push(`<b>Хэштеги (${hashtags.length}):</b>`);
  if (hashtags.length === 0) lines.push('  — пусто (добавь /discover_add #tag)');
  else hashtags.forEach((h) => lines.push(`  • #${escapeHtml(h)}`));

  await tgApi('sendMessage', {
    chat_id: chatId,
    text: lines.join('\n'),
    parse_mode: 'HTML',
  });
}

async function handleDiscoverEditTarget(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const raw = String(msg.text || '').trim();
  const isAdd = raw.startsWith('/discover_add');
  const arg = raw.replace(/^\/discover_(add|remove)\s*/i, '').trim();

  if (!arg) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'Использование:\n<code>/discover_add @account</code>\n<code>/discover_add #hashtag</code>',
      parse_mode: 'HTML',
    });
    return;
  }

  const linked = await queryOne('SELECT id FROM platform_users WHERE tg_chat_id = $1', [chatId]);
  if (!linked) {
    await tgApi('sendMessage', { chat_id: chatId, text: 'Сначала /start.' });
    return;
  }

  let kind, value;
  if (arg.startsWith('#')) {
    kind = 'hashtag';
    value = arg.slice(1).replace(/[^A-Za-zА-Яа-я0-9_]/g, '').toLowerCase();
  } else if (/^@?[A-Za-z0-9._]{2,}$/.test(arg)) {
    kind = 'competitor';
    value = '@' + arg.replace(/^@/, '');
  } else {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'Не понял. Жду <code>@account</code> или <code>#hashtag</code>.',
      parse_mode: 'HTML',
    });
    return;
  }
  if (!value) {
    await tgApi('sendMessage', { chat_id: chatId, text: 'Пустое значение.' });
    return;
  }

  // Ensure row exists
  await query(
    `INSERT INTO viral_discover_configs (user_id, tg_chat_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET tg_chat_id = EXCLUDED.tg_chat_id`,
    [linked.id, chatId],
  );

  const column = kind === 'hashtag' ? 'hashtags' : 'competitors';
  const storedValue = kind === 'hashtag' ? value : value;  // already normalised

  if (isAdd) {
    await query(
      `UPDATE viral_discover_configs
          SET ${column} = (
              SELECT ARRAY(SELECT DISTINCT unnest(${column} || ARRAY[$1::text]))
          )
        WHERE user_id = $2`,
      [storedValue, linked.id],
    );
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `✓ Добавлено: <code>${escapeHtml(kind === 'hashtag' ? '#' + value : value)}</code>\n\nПосмотреть всё: /discover_targets`,
      parse_mode: 'HTML',
    });
  } else {
    await query(
      `UPDATE viral_discover_configs
          SET ${column} = array_remove(${column}, $1::text)
        WHERE user_id = $2`,
      [storedValue, linked.id],
    );
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `✓ Удалено: <code>${escapeHtml(kind === 'hashtag' ? '#' + value : value)}</code>`,
      parse_mode: 'HTML',
    });
  }
}

export async function bootstrapOwnerHqMenu() {
  if (!TOKEN || !OWNER_TELEGRAM_ID) return { ok: false, error: 'owner_hq_menu_disabled' };
  const setMyCommands = await tgApi('setMyCommands', {
    commands: OWNER_HQ_COMMANDS,
    scope: { type: 'chat', chat_id: OWNER_TELEGRAM_ID },
    language_code: 'ru',
  });
  const setChatMenuButton = await tgApi('setChatMenuButton', {
    chat_id: OWNER_TELEGRAM_ID,
    menu_button: { type: 'commands' },
  });
  console.log('[webhook] bootstrapOwnerHqMenu:', {
    setMyCommands: setMyCommands?.ok,
    setChatMenuButton: setChatMenuButton?.ok,
    ownerTelegramId: OWNER_TELEGRAM_ID,
  });
  return { ok: Boolean(setMyCommands?.ok), setMyCommands, setChatMenuButton };
}

// ═══ TG API ════════════════════════════════════════════════════════
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
      return { ok: false, status: res.status, error: body.slice(0, 300) };
    }
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function renderWfdsHtml({ w7, w30, byKind, topUsers, activeSubs }) {
  const pct = (used, total) => total > 0 ? Math.round((used / total) * 100) + '%' : '—';
  const subsLine = activeSubs.map(s => `${s.plan} ×${s.count}`).join(' · ') || '0';
  const rowsKind = byKind.map(r => `<tr><td>${escapeHtml(r.kind)}</td><td>${r.total}</td><td>${r.used}</td><td>${pct(r.used, r.total)}</td></tr>`).join('');
  const rowsUsers = topUsers.map(u => `
    <tr>
      <td>${escapeHtml(u.name || '—')}</td>
      <td><code>${u.tg_chat_id || '—'}</code></td>
      <td>${escapeHtml(u.email || '—')}</td>
      <td>${u.total || 0}</td>
      <td><b>${u.used || 0}</b></td>
      <td>${u.last_delivered ? new Date(u.last_delivered).toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><title>WFDS Dashboard · AI Growth Office</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0c14;color:#e8e4f0;font:14px/1.5 -apple-system,system-ui,sans-serif;padding:32px 20px;max-width:1100px;margin:0 auto}
  h1{font-size:24px;font-weight:800;letter-spacing:-.5px;margin-bottom:6px}
  .sub{color:#7a82a0;font-size:12px;margin-bottom:28px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:32px}
  .card{background:#13162a;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px}
  .card h3{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#c8f060;margin-bottom:8px;font-weight:700}
  .card .v{font-size:32px;font-weight:800;letter-spacing:-1px;line-height:1}
  .card .v small{font-size:14px;color:#7a82a0;font-weight:500;margin-left:4px}
  .card .meta{font-size:11px;color:#7a82a0;margin-top:6px}
  section{margin-bottom:28px}
  section h2{font-size:14px;text-transform:uppercase;letter-spacing:1.5px;color:#60c8f0;margin-bottom:10px;font-weight:700}
  table{width:100%;border-collapse:collapse;background:#13162a;border-radius:10px;overflow:hidden;font-size:13px}
  th,td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left}
  th{background:rgba(255,255,255,.03);color:#c8f060;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700}
  tr:last-child td{border-bottom:none}
  code{font:12px 'JetBrains Mono',monospace;background:rgba(255,255,255,.06);padding:1px 6px;border-radius:4px;color:#c8f060}
  .foot{color:#7a82a0;font-size:11px;margin-top:32px;text-align:center}
</style></head><body>
  <h1>WFDS Dashboard</h1>
  <div class="sub">Weekly Founder Deliverables Shipped · обновляется в реальном времени · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>

  <div class="grid">
    <div class="card"><h3>WFDS 7d</h3><div class="v">${w7.used}<small>/${w7.total}</small></div><div class="meta">${pct(w7.used, w7.total)} использовано</div></div>
    <div class="card"><h3>30 дней</h3><div class="v">${w30.used}<small>/${w30.total}</small></div><div class="meta">${pct(w30.used, w30.total)} использовано</div></div>
    <div class="card"><h3>Active subs</h3><div class="v">${activeSubs.reduce((s, r) => s + Number(r.count), 0)}</div><div class="meta">${escapeHtml(subsLine)}</div></div>
  </div>

  <section>
    <h2>Артефакты по типам (30d)</h2>
    <table>
      <thead><tr><th>Kind</th><th>Доставлено</th><th>Использовано</th><th>%</th></tr></thead>
      <tbody>${rowsKind || '<tr><td colspan="4" style="text-align:center;color:#7a82a0">пока пусто</td></tr>'}</tbody>
    </table>
  </section>

  <section>
    <h2>Топ-20 клиентов (30d)</h2>
    <table>
      <thead><tr><th>Имя</th><th>chat_id</th><th>Email</th><th>Доставлено</th><th>Использовано</th><th>Последняя доставка</th></tr></thead>
      <tbody>${rowsUsers || '<tr><td colspan="6" style="text-align:center;color:#7a82a0">пока пусто</td></tr>'}</tbody>
    </table>
  </section>

  <div class="foot">AI Growth Office · worker.js · <code>?accept=application/json</code> для raw JSON</div>
</body></html>`;
}
