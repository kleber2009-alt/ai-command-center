// ═══════════════════════════════════════════════════════════════════
// netlify/functions/tg-voice-webhook.js
// ───────────────────────────────────────────────────────────────────
// POST /api/tg-voice-webhook  — Telegram Bot webhook for the Voice
// Composer bot (Phase 5 · Commit 2).
//
// FLOW
//   /start <owner_handle>   → bind this TG chat to that owner's voice
//   /voice                  → show current bound voice
//   /settings               → show TTS preferences (read-only for now)
//   /clear                  → unbind chat
//   /help                   → command list
//   any plain text          → generate voice note with the bound voice
//                             and send it back to the owner. Owner can
//                             then forward to any recipient manually
//                             (Telegram's native UX = the approval gate).
//
// SECURITY MODEL (MVP-1)
//   · Each chat must explicitly bind to an owner_handle via /start.
//   · There is no auto-reply to subscribers, no auto-posting anywhere.
//   · The bot only sends to the chat that messaged it.
//   · Every generation is logged to public.voice_generations with
//     {tg_chat_id, tg_message_id, text} for full audit trail.
//   · Setup webhook one-time:
//       curl -X POST "https://api.telegram.org/bot$TG_VOICE_BOT_TOKEN/setWebhook" \
//         -d "url=https://<your-domain>/api/tg-voice-webhook" \
//         -d "secret_token=$TG_WEBHOOK_SECRET"
//
// ENV VARS
//   TG_VOICE_BOT_TOKEN     — token from @BotFather (separate from notify-tg)
//   TG_WEBHOOK_SECRET      — optional, validates X-Telegram-Bot-Api-Secret-Token
//   ELEVENLABS_API_KEY     — for TTS
//   SUPABASE_URL           — Supabase project URL
//   SUPABASE_SERVICE_KEY   — service_role key (bypass RLS)
// ═══════════════════════════════════════════════════════════════════

import { generateVoiceNote, sbSelectOne } from './_shared/voice-pipeline.js';

const MAX_INCOMING_LEN = 1500;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Telegram always wants HTTP 200; we put error info in the body for logs.
function ack(extra = {}) {
  return json(200, { ok: true, ...extra });
}

export default async (request) => {
  if (request.method === 'GET') {
    // Health-check: useful while setting up the webhook.
    return json(200, {
      ok: true,
      service: 'tg-voice-webhook',
      hint: 'POST a Telegram Update here. See docs/PHASE_5.md.',
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const env = {
    TG_TOKEN: process.env.TG_VOICE_BOT_TOKEN,
    WEBHOOK_SECRET: process.env.TG_WEBHOOK_SECRET || null,
    elevenKey: process.env.ELEVENLABS_API_KEY,
    supaUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  };
  if (!env.TG_TOKEN) return json(503, { error: 'TG_VOICE_BOT_TOKEN_missing' });
  if (!env.elevenKey || !env.supaUrl || !env.serviceKey) {
    return json(503, { error: 'eleven_or_supabase_misconfigured' });
  }

  // Optional secret check (Telegram sends X-Telegram-Bot-Api-Secret-Token).
  if (env.WEBHOOK_SECRET) {
    const got = request.headers.get('x-telegram-bot-api-secret-token');
    if (got !== env.WEBHOOK_SECRET) return json(401, { error: 'bad_secret' });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return json(400, { error: 'bad_json' });
  }

  try {
    if (update.message) {
      await handleMessage(env, update.message);
    } else if (update.callback_query) {
      await handleCallback(env, update.callback_query);
    }
  } catch (e) {
    console.error('[tg-voice-webhook] handler error:', e);
    // Don't break the webhook on error — Telegram will retry indefinitely.
  }
  return ack();
};

// ═══ Message handler ═══════════════════════════════════════════════
async function handleMessage(env, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const username = msg.from?.username || null;
  const text = (msg.text || '').trim();
  if (!text) {
    return sendText(env.TG_TOKEN, chatId,
      '🤖 Я понимаю только текст. Пришли сообщение — озвучу твоим голосом.');
  }

  // Commands
  if (text === '/start' || text === '/start@_') {
    return sendText(env.TG_TOKEN, chatId, START_WELCOME, { parse_mode: 'HTML' });
  }
  if (text.startsWith('/start ')) {
    return cmdStart(env, chatId, userId, username, text.slice(7).trim());
  }
  if (text === '/help') {
    return sendText(env.TG_TOKEN, chatId, HELP_TEXT, { parse_mode: 'HTML' });
  }
  if (text === '/voice') {
    return cmdVoice(env, chatId);
  }
  if (text === '/settings') {
    return cmdSettings(env, chatId);
  }
  if (text === '/clear') {
    return cmdClear(env, chatId);
  }
  if (text.startsWith('/')) {
    return sendText(env.TG_TOKEN, chatId,
      '❓ Неизвестная команда. /help — список.');
  }

  // Plain text — generate voice note.
  return generateAndSend(env, chatId, msg.message_id, text);
}

// ═══ Callback handler (для будущих inline-кнопок approval) ═════════
async function handleCallback(env, cq) {
  // Stub for now. В Commit 3 здесь будет approval-flow для пересылки
  // subscribers'ам. Сейчас просто подтверждаем кнопку.
  await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: cq.id, text: 'OK' }),
  });
}

// ═══ Commands ══════════════════════════════════════════════════════

async function cmdStart(env, chatId, userId, username, handleArg) {
  const ownerHandle = normalizeHandle(handleArg);
  if (!ownerHandle) {
    return sendText(env.TG_TOKEN, chatId,
      '⚠ Укажи свой handle:\n<code>/start @your_handle</code>',
      { parse_mode: 'HTML' });
  }

  // Verify a voice exists for this handle.
  const voice = await sbSelectOne(
    env.supaUrl, env.serviceKey,
    `/rest/v1/voices?owner_handle=eq.${encodeURIComponent(ownerHandle)}&archived_at=is.null&select=*&order=created_at.desc&limit=1`,
  );
  if (!voice) {
    return sendText(env.TG_TOKEN, chatId,
      `❌ Голос для <b>${escapeHtml(ownerHandle)}</b> не найден.\n\n` +
      `Сначала создай его на <a href="https://ai-growth-office.ru/persona-train">/persona-train</a>, ` +
      `потом возвращайся и снова напиши /start.`,
      { parse_mode: 'HTML', disable_web_page_preview: true });
  }

  // Upsert bot_user.
  const res = await fetch(`${env.supaUrl}/rest/v1/voice_bot_users`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      tg_chat_id: chatId,
      tg_user_id: userId,
      tg_username: username,
      owner_handle: ownerHandle,
      last_active_at: new Date().toISOString(),
    }),
  });
  if (!res.ok && res.status !== 201) {
    const errText = await res.text();
    console.error('[bot] upsert failed', res.status, errText);
    return sendText(env.TG_TOKEN, chatId,
      '⚠ Не получилось привязать чат — попробуй ещё раз через минуту.');
  }

  return sendText(env.TG_TOKEN, chatId,
    `✅ Привязал к голосу <b>${escapeHtml(voice.display_name || ownerHandle)}</b>.\n\n` +
    `Теперь любое текстовое сообщение сюда → я озвучу твоим голосом и пришлю voice-note.\n\n` +
    `Дальше можешь переслать voice-note кому угодно через стандартную пересылку Telegram.`,
    { parse_mode: 'HTML' });
}

async function cmdVoice(env, chatId) {
  const user = await getBotUser(env, chatId);
  if (!user) return sendText(env.TG_TOKEN, chatId, '⚠ Сначала /start @твой_handle');

  const voice = await sbSelectOne(
    env.supaUrl, env.serviceKey,
    `/rest/v1/voices?owner_handle=eq.${encodeURIComponent(user.owner_handle)}&archived_at=is.null&select=*&order=created_at.desc&limit=1`,
  );
  if (!voice) {
    return sendText(env.TG_TOKEN, chatId,
      `⚠ Голос для <b>${escapeHtml(user.owner_handle)}</b> архивирован или удалён.\n` +
      `Создай новый: /persona-train`,
      { parse_mode: 'HTML' });
  }

  return sendText(env.TG_TOKEN, chatId,
    `🎙 <b>${escapeHtml(voice.display_name || user.owner_handle)}</b>\n\n` +
    `Owner: <code>${escapeHtml(user.owner_handle)}</code>\n` +
    `Provider: ${voice.provider}\n` +
    `Voice ID: <code>${voice.provider_voice_id}</code>\n` +
    `Создан: ${new Date(voice.created_at).toLocaleString('ru-RU')}\n` +
    `Sample: ${voice.sample_seconds ? voice.sample_seconds + 's' : '—'}`,
    { parse_mode: 'HTML' });
}

async function cmdSettings(env, chatId) {
  const user = await getBotUser(env, chatId);
  if (!user) return sendText(env.TG_TOKEN, chatId, '⚠ Сначала /start @твой_handle');

  const p = user.preferences || {};
  return sendText(env.TG_TOKEN, chatId,
    `⚙ <b>Настройки</b>\n\n` +
    `model: <code>${p.model_id || 'eleven_multilingual_v2'}</code>\n` +
    `stability: ${p.stability ?? 0.55}\n` +
    `similarity_boost: ${p.similarity_boost ?? 0.85}\n` +
    `style: ${p.style ?? 0.0}\n\n` +
    `<i>Редактирование настроек будет в следующих версиях.</i>`,
    { parse_mode: 'HTML' });
}

async function cmdClear(env, chatId) {
  await fetch(
    `${env.supaUrl}/rest/v1/voice_bot_users?tg_chat_id=eq.${chatId}`,
    {
      method: 'DELETE',
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
      },
    },
  );
  return sendText(env.TG_TOKEN, chatId,
    '✂ Чат отвязан. Напиши /start @твой_handle чтобы привязать заново.');
}

// ═══ Voice generation ══════════════════════════════════════════════

async function generateAndSend(env, chatId, messageId, text) {
  if (text.length > MAX_INCOMING_LEN) {
    return sendText(env.TG_TOKEN, chatId,
      `⚠ Слишком длинное сообщение (${text.length}). Максимум — ${MAX_INCOMING_LEN} символов.`);
  }

  const user = await getBotUser(env, chatId);
  if (!user) {
    return sendText(env.TG_TOKEN, chatId,
      '⚠ Сначала привяжи чат к своему голосу:\n<code>/start @your_handle</code>',
      { parse_mode: 'HTML' });
  }

  // Update last_active_at (best-effort).
  fetch(`${env.supaUrl}/rest/v1/voice_bot_users?tg_chat_id=eq.${chatId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ last_active_at: new Date().toISOString() }),
  }).catch(() => {});

  // Show "recording voice…" indicator.
  await sendChatAction(env.TG_TOKEN, chatId, 'record_voice');

  const prefs = user.preferences || {};
  const result = await generateVoiceNote({
    supaUrl: env.supaUrl,
    serviceKey: env.serviceKey,
    elevenKey: env.elevenKey,
    text,
    owner_handle: user.owner_handle,
    model: prefs.model_id,
    stability: prefs.stability,
    similarity: prefs.similarity_boost,
    style: prefs.style,
    source: 'tg-bot',
    meta: { tg_chat_id: chatId, tg_message_id: messageId },
  });

  if (!result.ok) {
    return sendText(env.TG_TOKEN, chatId,
      `❌ Не получилось озвучить (${result.code || 'error'}): ${truncate(result.details || '', 200)}`);
  }

  // Send the voice note. Telegram fetches from public Supabase Storage URL.
  const sendRes = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendVoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      voice: result.audioUrl,
      caption: `🤖 ${truncate(text, 150)}`,
      reply_to_message_id: messageId,
      allow_sending_without_reply: true,
    }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    // Fallback: try sendAudio if sendVoice is finicky about MP3.
    const fb = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendAudio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        audio: result.audioUrl,
        caption: `🤖 (fallback as audio) ${truncate(text, 120)}`,
        reply_to_message_id: messageId,
        allow_sending_without_reply: true,
      }),
    });
    if (!fb.ok) {
      return sendText(env.TG_TOKEN, chatId,
        `⚠ Voice сгенерирован, но Telegram отказался принимать.\n` +
        `Ссылка: ${result.audioUrl}\n` +
        `Ошибка: ${truncate(errText, 200)}`);
    }
  }

  // Update log row with TG provenance.
  if (result.generationId) {
    fetch(`${env.supaUrl}/rest/v1/voice_generations?id=eq.${result.generationId}`, {
      method: 'PATCH',
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'sent',
        tg_chat_id: chatId,
        tg_message_id: messageId,
      }),
    }).catch(() => {});
  }
}

// ═══ Telegram helpers ══════════════════════════════════════════════

async function sendText(token, chatId, text, extra = {}) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...extra,
    }),
  });
}

async function sendChatAction(token, chatId, action) {
  return fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

// ═══ DB helpers ════════════════════════════════════════════════════

async function getBotUser(env, chatId) {
  return sbSelectOne(
    env.supaUrl, env.serviceKey,
    `/rest/v1/voice_bot_users?tg_chat_id=eq.${chatId}&select=*&limit=1`,
  );
}

// ═══ Misc ══════════════════════════════════════════════════════════

function normalizeHandle(s) {
  const t = String(s || '').trim().split(/\s+/)[0];
  if (!t) return null;
  // Accept @handle, handle, or email.
  if (t.includes('@') && t.includes('.')) return t.toLowerCase(); // email
  return t.startsWith('@') ? t : '@' + t;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ═══ Templates ═════════════════════════════════════════════════════

const START_WELCOME = `
🎙 <b>AI Voice Composer</b>

Я озвучиваю текст твоим клонированным голосом и присылаю voice-note сюда.
Дальше пересылай кому угодно — Telegram-нативная пересылка работает идеально.

<b>Как начать:</b>
1. Создай клон голоса: https://ai-growth-office.ru/persona-train
2. Привяжи этот чат: <code>/start @твой_handle</code>
3. Просто пиши сообщения сюда — я буду озвучивать.

<b>Команды:</b> /help
`.trim();

const HELP_TEXT = `
<b>Команды:</b>
<code>/start @handle</code> — привязать чат к твоему голосу
<code>/voice</code> — показать активный голос
<code>/settings</code> — настройки TTS (read-only)
<code>/clear</code> — отвязать чат
<code>/help</code> — эта подсказка

<b>Использование:</b>
Просто пиши любой текст — я озвучу его и пришлю voice-note.
Максимум — 1500 символов на сообщение.

<b>Где создать голос:</b>
https://ai-growth-office.ru/persona-train
`.trim();

export const config = { path: '/api/tg-voice-webhook' };
