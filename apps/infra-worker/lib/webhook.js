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
import * as parserBot from './parser_bot.js';
import * as heygen from './heygen.js';
import { registerCabinet } from './cabinet.js';

const TG_TRANSCRIBE_BOT_TOKEN = process.env.TG_TRANSCRIBE_BOT_TOKEN || '';
const VIRAL_CLONE_DISPATCH_SECRET = process.env.VIRAL_CLONE_DISPATCH_SECRET || '';

// Owner-pinning для /clone: если dispatch приходит от этого TG-id, в pipeline
// проставляется фиксированный HeyGen voice_id (text-path, без ElevenLabs).
// Owner-у тренировать голос не нужно — он уже сидит в HeyGen-овской библиотеке.
const OWNER_TELEGRAM_ID = Number(process.env.OWNER_TELEGRAM_ID || 0);
const OWNER_HEYGEN_VOICE_ID = process.env.OWNER_HEYGEN_VOICE_ID || '93d1ab8db88b479ca452e31897389118';

// Скачивает аудио-файл из Telegram (voice / audio). Отличается от
// downloadTgFile тем, что для voice-сообщений TG отдаёт OGG/Opus, а для
// audio — mp3/m4a; content-type сохраняем по расширению `file_path`.
async function downloadTgAudio(fileId) {
  if (!TG_TRANSCRIBE_BOT_TOKEN) return { ok: false, error: 'TG_TRANSCRIBE_BOT_TOKEN not set' };
  let infoRes;
  try {
    infoRes = await fetch(`https://api.telegram.org/bot${TG_TRANSCRIBE_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  } catch (e) {
    return { ok: false, error: `getFile fetch: ${e.message}` };
  }
  const info = await infoRes.json().catch(() => ({}));
  if (!info?.ok) return { ok: false, error: `getFile: ${info?.description || 'unknown'}` };
  const path = info.result?.file_path;
  if (!path) return { ok: false, error: 'getFile: no file_path' };

  let fileRes;
  try {
    fileRes = await fetch(`https://api.telegram.org/file/bot${TG_TRANSCRIBE_BOT_TOKEN}/${path}`);
  } catch (e) {
    return { ok: false, error: `audio download fetch: ${e.message}` };
  }
  if (!fileRes.ok) return { ok: false, error: `audio download ${fileRes.status}` };
  const ab = await fileRes.arrayBuffer();
  const buffer = Buffer.from(ab);
  const ext = (path.split('.').pop() || '').toLowerCase();
  const contentType =
    ext === 'mp3' ? 'audio/mpeg' :
    ext === 'm4a' ? 'audio/mp4' :
    ext === 'wav' ? 'audio/wav' :
    ext === 'ogg' || ext === 'oga' ? 'audio/ogg' :
    'audio/ogg'; // TG voice-сообщения по умолчанию OGG/Opus
  return { ok: true, buffer, contentType };
}

// Скачивает Telegram-файл по file_id, отдаёт {buffer, contentType}.
// Бот шлёт только file_id, чтобы не таскать байты по HTTP туда-сюда.
async function downloadTgFile(fileId) {
  if (!TG_TRANSCRIBE_BOT_TOKEN) return { ok: false, error: 'TG_TRANSCRIBE_BOT_TOKEN not set' };
  let infoRes;
  try {
    infoRes = await fetch(`https://api.telegram.org/bot${TG_TRANSCRIBE_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  } catch (e) {
    return { ok: false, error: `getFile fetch: ${e.message}` };
  }
  const info = await infoRes.json().catch(() => ({}));
  if (!info?.ok) return { ok: false, error: `getFile: ${info?.description || 'unknown'}` };
  const path = info.result?.file_path;
  if (!path) return { ok: false, error: 'getFile: no file_path' };

  let fileRes;
  try {
    fileRes = await fetch(`https://api.telegram.org/file/bot${TG_TRANSCRIBE_BOT_TOKEN}/${path}`);
  } catch (e) {
    return { ok: false, error: `file download fetch: ${e.message}` };
  }
  if (!fileRes.ok) return { ok: false, error: `file download ${fileRes.status}` };
  const ab = await fileRes.arrayBuffer();
  const buffer = Buffer.from(ab);
  // Угадываем content-type по расширению; HeyGen принимает image/jpeg|png|webp.
  const ext = (path.split('.').pop() || '').toLowerCase();
  const contentType =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    'image/jpeg';
  return { ok: true, buffer, contentType };
}

const EXPECTED_SECRET = process.env.TG_OFFICE_WEBHOOK_SECRET || '';
const TOKEN = process.env.TG_OFFICE_BOT_TOKEN || '';

export function registerWebhook(fastify) {
  // Health endpoint for quick sanity checks
  fastify.get('/worker/health', async () => ({
    ok: true,
    tg: Boolean(TOKEN),
    secret_set: Boolean(EXPECTED_SECRET),
  }));

  // Парсер cabinet (auth + JSON API). Served from parser.…/cabinet/* via Caddy.
  registerCabinet(fastify);

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

    // Если бот передал photo_id — подтягиваем heygen_talking_photo_id
    // из clone_user_photos, чтобы HeyGen использовал фото юзера, а не
    // дефолтный аватар.
    let talkingPhotoId = null;
    let clonePhotoId = null;
    if (body.photo_id) {
      const photoRow = await queryOne(
        'SELECT id, heygen_talking_photo_id FROM clone_user_photos WHERE id = $1',
        [Number(body.photo_id)],
      );
      if (photoRow) {
        clonePhotoId = photoRow.id;
        talkingPhotoId = photoRow.heygen_talking_photo_id;
      }
    }

    // Voice routing (фиксируем в момент dispatch, чтобы видео конкретного
    // pipeline'а не «уплывало» если юзер позже переобучил голос):
    //   1) бот явно прислал `voice_id` (юзер выбрал в меню) → используем
    //   2) owner_id → HeyGen voice (text-path, fast)
    //   3) последний обученный voice клиента (legacy fallback для случая
    //      когда бот не прислал voice_id — например, старая версия клиента)
    //   4) ничего → submit упадёт в HEYGEN_DEFAULT_VOICE_ID
    const userTgId = body.user_telegram_id ? Number(body.user_telegram_id) : null;
    const explicitVoiceId = typeof body.voice_id === 'string' && body.voice_id.trim()
      ? body.voice_id.trim()
      : null;
    let heygenVoiceId = null;
    let elevenVoiceId = null;
    if (explicitVoiceId) {
      // Бот уже знает choice — используем как есть. Это нормальный путь
      // после деплоя нового voice-picker'а.
      elevenVoiceId = explicitVoiceId;
    } else if (userTgId && OWNER_TELEGRAM_ID && userTgId === OWNER_TELEGRAM_ID) {
      heygenVoiceId = OWNER_HEYGEN_VOICE_ID;
    } else if (userTgId) {
      const voiceRow = await queryOne(
        `SELECT eleven_voice_id
           FROM clone_user_voices
          WHERE telegram_user_id = $1 AND status = 'ready'
          ORDER BY created_at DESC
          LIMIT 1`,
        [userTgId],
      );
      if (voiceRow?.eleven_voice_id) elevenVoiceId = voiceRow.eleven_voice_id;
    }

    const pipeline = await queryOne(
      `INSERT INTO viral_pipelines
         (user_id, tg_chat_id, competitor_account, source_url, stage,
          heygen_talking_photo_id, clone_photo_id, heygen_voice_id, eleven_voice_id)
       VALUES ($1, $2, $3, $4, 'init', $5, $6, $7, $8)
       RETURNING id`,
      [userId, chatId, competitor, sourceUrl, talkingPhotoId, clonePhotoId, heygenVoiceId, elevenVoiceId],
    );
    await query(
      `INSERT INTO scheduled_jobs (kind, scheduled_at, status, payload)
       VALUES ('viral_clone', NOW(), 'pending', $1::jsonb)`,
      [JSON.stringify({ pipeline_id: pipeline.id })],
    );

    return { ok: true, pipeline_id: pipeline.id };
  });

  // ── /worker/clone/photos?tg=<telegram_user_id> ────────────────────
  // Возвращает список фото юзера для inline-кнопок «взять из памяти».
  // Защита — общий VIRAL_CLONE_DISPATCH_SECRET (тот же, что у dispatch).
  fastify.get('/worker/clone/photos', async (request, reply) => {
    if (!VIRAL_CLONE_DISPATCH_SECRET) return reply.code(503).send({ ok: false, error: 'dispatch_disabled' });
    if (request.headers['x-dispatch-secret'] !== VIRAL_CLONE_DISPATCH_SECRET) {
      return reply.code(401).send({ ok: false, error: 'bad_secret' });
    }
    const tg = Number(request.query?.tg);
    if (!Number.isFinite(tg)) return reply.code(400).send({ ok: false, error: 'tg required' });
    const rows = await query(
      `SELECT id, name, created_at
         FROM clone_user_photos
        WHERE telegram_user_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [tg],
    );
    return { ok: true, photos: rows };
  });

  // ── /worker/clone/photo ───────────────────────────────────────────
  // POST {tg_user_id, file_id, name} — бот шлёт сюда после того, как
  // юзер прислал фото + название. Воркер качает с TG, заливает в
  // HeyGen Asset Storage, сохраняет в clone_user_photos и возвращает
  // {photo_id, name} для немедленного использования в dispatch.
  fastify.post('/worker/clone/photo', async (request, reply) => {
    if (!VIRAL_CLONE_DISPATCH_SECRET) return reply.code(503).send({ ok: false, error: 'dispatch_disabled' });
    if (request.headers['x-dispatch-secret'] !== VIRAL_CLONE_DISPATCH_SECRET) {
      return reply.code(401).send({ ok: false, error: 'bad_secret' });
    }
    const body = request.body || {};
    const tg = Number(body.tg_user_id);
    const fileId = typeof body.file_id === 'string' ? body.file_id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (!Number.isFinite(tg) || !fileId || !name) {
      return reply.code(400).send({ ok: false, error: 'tg_user_id + file_id + name required' });
    }

    const dl = await downloadTgFile(fileId);
    if (!dl.ok) return reply.code(502).send({ ok: false, error: `tg download: ${dl.error}` });

    const up = await heygen.uploadTalkingPhoto(dl.buffer, dl.contentType);
    if (!up.ok) return reply.code(502).send({ ok: false, error: `heygen upload: ${up.error}` });

    const row = await queryOne(
      `INSERT INTO clone_user_photos
         (telegram_user_id, name, heygen_talking_photo_id, telegram_file_id, source_image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name`,
      [tg, name, up.talkingPhotoId, fileId, up.url || null],
    );
    return { ok: true, photo_id: row.id, name: row.name };
  });

  // ── /worker/clone/voice — обучение голоса клиента ────────────────
  // POST {tg_user_id, file_id, name?} — transcribe-бот шлёт сюда после
  // того, как юзер прислал voice/audio. Воркер качает с TG, отправляет
  // в ElevenLabs IVC, сохраняет voice_id в clone_user_voices.
  // Защита — общий VIRAL_CLONE_DISPATCH_SECRET (тот же, что у dispatch).
  fastify.post('/worker/clone/voice', async (request, reply) => {
    if (!VIRAL_CLONE_DISPATCH_SECRET) return reply.code(503).send({ ok: false, error: 'dispatch_disabled' });
    if (request.headers['x-dispatch-secret'] !== VIRAL_CLONE_DISPATCH_SECRET) {
      return reply.code(401).send({ ok: false, error: 'bad_secret' });
    }
    const body = request.body || {};
    const tg = Number(body.tg_user_id);
    const fileId = typeof body.file_id === 'string' ? body.file_id.trim() : '';
    const name = typeof body.name === 'string'
      ? body.name.trim().slice(0, 80)
      : `Голос · ${new Date().toISOString().slice(0, 10)}`;
    if (!Number.isFinite(tg) || !fileId) {
      return reply.code(400).send({ ok: false, error: 'tg_user_id + file_id required' });
    }

    const dl = await downloadTgAudio(fileId);
    if (!dl.ok) return reply.code(502).send({ ok: false, error: `tg download: ${dl.error}` });

    // ElevenLabs IVC хочет минимум ~30 сек; TG voice 1 мин ≈ 200–500KB OGG/Opus.
    if (dl.buffer.length < 30 * 1024) {
      return reply.code(400).send({
        ok: false,
        error: `audio too short (${dl.buffer.length} bytes). Нужен сэмпл от 30 секунд.`,
      });
    }

    const cloneRes = await cloneVoice({
      audioBuffer: dl.buffer,
      audioMime: dl.contentType,
      name,
    });
    if (!cloneRes.ok) {
      return reply.code(cloneRes.status || 502).send(cloneRes);
    }

    const row = await queryOne(
      `INSERT INTO clone_user_voices
         (telegram_user_id, name, eleven_voice_id, source_file_id, sample_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, eleven_voice_id`,
      [tg, name, cloneRes.voice_id, fileId, dl.buffer.length],
    );

    return reply.send({
      ok: true,
      voice_id: cloneRes.voice_id,
      voice_row_id: row.id,
      name: row.name,
    });
  });

  // ── /worker/clone/voices?tg=<telegram_user_id> ───────────────────
  fastify.get('/worker/clone/voices', async (request, reply) => {
    if (!VIRAL_CLONE_DISPATCH_SECRET) return reply.code(503).send({ ok: false, error: 'dispatch_disabled' });
    if (request.headers['x-dispatch-secret'] !== VIRAL_CLONE_DISPATCH_SECRET) {
      return reply.code(401).send({ ok: false, error: 'bad_secret' });
    }
    const tg = Number(request.query?.tg);
    if (!Number.isFinite(tg)) return reply.code(400).send({ ok: false, error: 'tg required' });
    const rows = await query(
      `SELECT id, name, eleven_voice_id, created_at
         FROM clone_user_voices
        WHERE telegram_user_id = $1 AND status = 'ready'
        ORDER BY created_at DESC
        LIMIT 10`,
      [tg],
    );
    return { ok: true, voices: rows };
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
        if (t === '/start' || t.startsWith('/start ')) {
          await handleStart(update.message);
        } else if (t === '/menu' || t === '/menu@AI_Growth_Office_Bot' || t === '/help' || t === '/help@AI_Growth_Office_Bot') {
          await sendMainMenu(update.message.chat.id, update.message.from);
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

  // Menu navigation: m:<section>
  if (data.startsWith('m:')) {
    const section = data.slice(2) || 'home';
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id });
    await showMenuSection(cq, section);
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

  // Already linked?
  const linked = await queryOne(
    'SELECT id, name FROM platform_users WHERE tg_chat_id = $1',
    [chatId],
  );
  if (linked) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text:
        `С возвращением, ${escapeHtml(linked.name || firstName)} ✨\n\n` +
        'Команда продолжает работать. Утренние планёрки приходят в будни в 11:30 (Мск).\n\n' +
        'Что хочешь сделать?',
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(),
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
      'Пока — посмотри, что я умею:\n\n' +
      `<i>chat_id: ${chatId}</i>`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: mainMenuKeyboard(),
  });
}

// ═══ Main menu ════════════════════════════════════════════════════════
//
// Inline keyboard, callback_data prefix `m:` — handled in handleCallback.
// Sections:
//   m:clone    — viral_clone pipeline (/clone)
//   m:discover — daily niche parser (/discover)
//   m:voice    — voice clone onboarding
//   m:billing  — subscription / pricing
//   m:daily    — what artefacts get delivered automatically
//   m:help     — general help / contacts

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🎬 Клон рилса', callback_data: 'm:clone' },
        { text: '🔎 Парсер ниши', callback_data: 'm:discover' },
      ],
      [
        { text: '🎙 Голос Ани', callback_data: 'm:voice' },
        { text: '💎 Подписка', callback_data: 'm:billing' },
      ],
      [
        { text: '📬 Что я доставляю', callback_data: 'm:daily' },
        { text: '❓ Помощь', callback_data: 'm:help' },
      ],
    ],
  };
}

function backToMenuKeyboard() {
  return { inline_keyboard: [[{ text: '← Назад в меню', callback_data: 'm:home' }]] };
}

const MENU_TEXTS = {
  home:
    '🤖 <b>AI Growth Office — главное меню</b>\n\n' +
    'Выбери раздел — расскажу, как это работает.',

  clone:
    '🎬 <b>Клон рилса</b>\n\n' +
    'Беру чужой залетевший рилс, переписываю под твою нишу и пересобираю с твоим лицом и голосом.\n\n' +
    '<b>Как запустить:</b>\n' +
    '• <code>/clone https://www.instagram.com/reel/XXXX/</code> — конкретный рилс\n' +
    '• <code>/clone @competitor</code> — найду самый «залетевший» у конкурента за 30 дней\n\n' +
    '<b>Что происходит:</b>\n' +
    '1. Скачиваю видео (yt-dlp / Apify)\n' +
    '2. Расшифровываю аудио (Whisper)\n' +
    '3. Переписываю текст под твою нишу (Claude)\n' +
    '4. Генерирую видео с твоим аватаром (HeyGen)\n' +
    '5. Добавляю субтитры Hormozi 2 + B-rolls + zooms (Submagic)\n' +
    '6. Шлю файл сюда\n\n' +
    '<i>Время: 3–7 минут. Если файл &gt;50МБ — пришлю ссылку.</i>',

  discover:
    '🔎 <b>Парсер ниши</b>\n\n' +
    'Каждое утро в 08:00 МСК ищу залетевшие посты конкурентов в твоей нише и присылаю топ-5 рилсов + топ-5 каруселей с оценкой «зайдёт у тебя» 1–10.\n\n' +
    '<b>Настройка (3 шага):</b>\n' +
    '1. <code>/discover_setup коуч по продажам B2B для собственников</code> — опиши нишу\n' +
    '2. <code>/discover_add @competitor</code> или <code>/discover_add #hashtag</code> — добавь источники\n' +
    '3. <code>/discover</code> — запустить сейчас (или жди завтрашнего утра)\n\n' +
    '<b>Управление:</b>\n' +
    '• <code>/discover_targets</code> — посмотреть список\n' +
    '• <code>/discover_remove @account</code> — убрать источник',

  voice:
    '🎙 <b>Голос Ани (твой голосовой клон)</b>\n\n' +
    'Аня — начальник твоего офиса — говорит твоим голосом. Раз в неделю шлёт голосовое с готовым Reels-сценарием и сводкой недели.\n\n' +
    '<b>Чтобы записать голос:</b>\n' +
    'Зайди в онбординг на сайте — <a href="https://ai-office.46-62-215-11.nip.io/onboarding.html">ai-office.46-62-215-11.nip.io/onboarding.html</a> — шаг 11 «Запиши голос».\n\n' +
    '<b>Нужно:</b>\n' +
    '• 30–60 секунд непрерывной речи\n' +
    '• Без эха, без музыки, без второго голоса\n' +
    '• Текст любой — лучше расскажи про свой продукт\n\n' +
    '<i>Технология: ElevenLabs Instant Voice Cloning. Голос привязывается к твоему аккаунту, никто другой им не воспользуется.</i>',

  billing:
    '💎 <b>Подписка</b>\n\n' +
    'Три тарифа — выбирай под уровень амбиций:\n\n' +
    '• <b>Pro</b> — 1 990 ₽/мес — daily-планёрки + клоны рилсов\n' +
    '• <b>Builder</b> — 5 900 ₽/мес — + парсер ниши + еженедельный голос\n' +
    '• <b>Architect</b> — 14 900 ₽/мес — + кастомные агенты под твою воронку\n\n' +
    '<b>Оплата:</b> Telegram Stars (RU-friendly) или ЮKassa.\n\n' +
    'Откроется страница тарифов 👇',

  daily:
    '📬 <b>Что я доставляю автоматически</b>\n\n' +
    '<b>Утренняя планёрка</b> — будни 11:30 МСК\n' +
    'Дайджест от Ани: что команда сделала вчера, что в работе сегодня, какие гипотезы на тест.\n\n' +
    '<b>Пятничный отчёт</b> — пятница 18:00 МСК\n' +
    'Сводка недели + голосовое от Ани + Reels-сценарий на выходные.\n\n' +
    '<b>Контент-план</b> — последний день месяца\n' +
    'Календарь постов на следующий месяц под твою нишу.\n\n' +
    '<b>Welcome voice</b> — Day-0 +23 минуты после оплаты\n' +
    'Аня представляется голосовым в твоём же голосе с готовым первым Reels-сценарием.\n\n' +
    '<i>Под каждым артефактом — кнопки ✅ «использовал» / ❌ «не пригодится». Это твой WFDS — North-Star метрика офиса.</i>',

  help:
    '❓ <b>Помощь</b>\n\n' +
    '<b>Команды:</b>\n' +
    '• /menu — это меню\n' +
    '• /clone — клон рилса\n' +
    '• /discover — парсер ниши\n' +
    '• /discover_setup — описать нишу\n' +
    '• /discover_targets — список источников\n' +
    '• /start — приветствие\n\n' +
    '<b>Контакты:</b>\n' +
    '• Сайт: <a href="https://ai-office.46-62-215-11.nip.io/">ai-office.46-62-215-11.nip.io</a>\n' +
    '• Поддержка: ответь на любое моё сообщение — прочту лично.\n\n' +
    '<b>Что-то сломалось?</b> Напиши сюда: «не работает X» — Илья (founder) увидит в течение часа.',
};

async function sendMainMenu(chatId, from) {
  const firstName = from?.first_name || from?.username || 'друг';
  await tgApi('sendMessage', {
    chat_id: chatId,
    text:
      `${escapeHtml(firstName)}, выбирай раздел:\n\n` +
      MENU_TEXTS.home,
    parse_mode: 'HTML',
    reply_markup: mainMenuKeyboard(),
  });
}

async function showMenuSection(cq, section) {
  const msg = cq.message;
  if (!msg?.chat?.id || !msg?.message_id) return;

  const text = MENU_TEXTS[section] || MENU_TEXTS.home;
  const isHome = section === 'home';
  const keyboard = isHome ? mainMenuKeyboard() : backToMenuKeyboard();

  // billing — extra inline button straight to pricing
  if (section === 'billing') {
    keyboard.inline_keyboard.unshift([
      { text: '💎 Открыть тарифы', url: 'https://ai-office.46-62-215-11.nip.io/pricing.html' },
    ]);
  }

  // Try to edit in place; if the message has no text (e.g. payment receipt),
  // editMessageText fails — fall back to a fresh sendMessage.
  const edit = await tgApi('editMessageText', {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
  if (!edit?.ok) {
    await tgApi('sendMessage', {
      chat_id: msg.chat.id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  }
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

// ═══ Bot menu bootstrap ════════════════════════════════════════════
//
// Called once at worker boot. Idempotent — Telegram silently no-ops if
// commands/menu_button are already what we send. Safe to retry.

const BOT_COMMANDS = [
  { command: 'menu',     description: 'Главное меню' },
  { command: 'clone',    description: 'Клонировать чужой рилс под себя' },
  { command: 'discover', description: 'Запустить парсер ниши сейчас' },
  { command: 'discover_setup',   description: 'Описать свою нишу для парсера' },
  { command: 'discover_targets', description: 'Список аккаунтов и хэштегов парсера' },
  { command: 'help',     description: 'Помощь и контакты' },
];

export async function bootstrapBotMenu() {
  if (!TOKEN) {
    console.log('[webhook] bootstrapBotMenu: TG_OFFICE_BOT_TOKEN not set, skip');
    return { ok: false, error: 'no_token' };
  }
  const cmds = await tgApi('setMyCommands', {
    commands: BOT_COMMANDS,
    scope: { type: 'all_private_chats' },
    language_code: 'ru',
  });
  const btn = await tgApi('setChatMenuButton', {
    menu_button: { type: 'commands' },
  });
  console.log('[webhook] bootstrapBotMenu:', {
    setMyCommands: cmds?.ok,
    setChatMenuButton: btn?.ok,
  });
  return { ok: Boolean(cmds?.ok && btn?.ok), setMyCommands: cmds, setChatMenuButton: btn };
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
