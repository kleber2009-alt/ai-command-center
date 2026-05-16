// ═══════════════════════════════════════════════════════════════════
// lib/tg-voice-bot.js — Telegram Voice Composer Bot handler
// ───────────────────────────────────────────────────────────────────
// Port of ai-office-project/netlify/functions/tg-voice-webhook.js to
// the self-hosted backend. Same flow, but talks to local Postgres
// instead of Supabase REST.
// ═══════════════════════════════════════════════════════════════════

import { queryOne, query } from './db.js';
import { generateVoiceNote } from './voice-pipeline.js';
import { markGenerationSent } from './generations.js';

const MAX_INCOMING_LEN = 1500;

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const TG_TOKEN = process.env.TG_VOICE_BOT_TOKEN;

export function isConfigured() {
  return Boolean(TG_TOKEN);
}

export async function handleUpdate(update) {
  if (update.message) {
    await handleMessage(update.message);
  } else if (update.callback_query) {
    await answerCallback(update.callback_query);
  }
}

// ═══ Message routing ═══════════════════════════════════════════════
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const username = msg.from?.username || null;
  const text = (msg.text || '').trim();

  if (!text) {
    return sendText(chatId, '🤖 Я понимаю только текст. Пришли сообщение — озвучу твоим голосом.');
  }

  if (text === '/start' || text === '/start@_') {
    return sendText(chatId, START_WELCOME, { parse_mode: 'HTML' });
  }
  if (text.startsWith('/start ')) {
    return cmdStart(chatId, userId, username, text.slice(7).trim());
  }
  if (text.startsWith('/verify ') || text.startsWith('/bind ')) {
    return cmdStart(chatId, userId, username, text.replace(/^\/(verify|bind)\s+/, '').trim());
  }
  if (text === '/help') {
    return sendText(chatId, HELP_TEXT, { parse_mode: 'HTML' });
  }
  if (text === '/voice') {
    return cmdVoice(chatId);
  }
  if (text === '/settings') {
    return cmdSettings(chatId);
  }
  if (text === '/clear') {
    return cmdClear(chatId);
  }
  if (text.startsWith('/')) {
    return sendText(chatId, '❓ Неизвестная команда. /help — список.');
  }

  return generateAndSend(chatId, msg.message_id, text);
}

// ═══ Commands ══════════════════════════════════════════════════════

async function cmdStart(chatId, userId, username, args) {
  const parts = String(args || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return sendText(chatId,
      '⚠ Привязка чата требует одноразовый токен.\n\n' +
      `Создай голос на ${PUBLIC_BASE_URL}/persona-train — там после клонирования покажется код.\n\n` +
      'Затем сюда: <code>/start @твой_handle XXX-XXX</code>',
      { parse_mode: 'HTML', disable_web_page_preview: true });
  }

  const ownerHandle = normalizeHandle(parts[0]);
  const rawToken = (parts[1] || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!ownerHandle) {
    return sendText(chatId,
      '⚠ Не понял handle. Формат:\n<code>/start @your_handle XXX-XXX</code>',
      { parse_mode: 'HTML' });
  }
  if (!rawToken || rawToken.length < 5) {
    return sendText(chatId,
      `⚠ Нужен одноразовый код.\n\n` +
      `Получи его на ${PUBLIC_BASE_URL}/persona-train (после создания голоса для <code>${escapeHtml(ownerHandle)}</code>).`,
      { parse_mode: 'HTML', disable_web_page_preview: true });
  }

  const voice = await queryOne(
    'select * from voices where owner_handle = $1 and archived_at is null order by created_at desc limit 1',
    [ownerHandle],
  );
  if (!voice) {
    return sendText(chatId,
      `❌ Голос для <b>${escapeHtml(ownerHandle)}</b> не найден.\n\n` +
      `Сначала создай его на ${PUBLIC_BASE_URL}/persona-train.`,
      { parse_mode: 'HTML', disable_web_page_preview: true });
  }

  const token = await queryOne(
    `select * from voice_binding_tokens
      where token = $1 and owner_handle = $2 and used_at is null
      limit 1`,
    [rawToken, ownerHandle],
  );
  if (!token) {
    return sendText(chatId,
      '❌ Код неверный, использован или просрочен.\n\n' +
      `Создай новый код на ${PUBLIC_BASE_URL}/persona-train.`,
      { parse_mode: 'HTML', disable_web_page_preview: true });
  }
  if (new Date(token.expires_at).getTime() < Date.now()) {
    return sendText(chatId, '❌ Код просрочен (старше 1 часа). Сгенерируй новый.');
  }

  await query(
    'update voice_binding_tokens set used_at = now(), used_by_chat_id = $1 where token = $2',
    [chatId, rawToken],
  );

  await query(
    `insert into voice_bot_users (tg_chat_id, tg_user_id, tg_username, owner_handle, last_active_at)
     values ($1, $2, $3, $4, now())
     on conflict (tg_chat_id) do update
       set tg_user_id = excluded.tg_user_id,
           tg_username = excluded.tg_username,
           owner_handle = excluded.owner_handle,
           last_active_at = now()`,
    [chatId, userId, username, ownerHandle],
  );

  return sendText(chatId,
    `✅ Привязал к голосу <b>${escapeHtml(voice.display_name || ownerHandle)}</b>.\n\n` +
    `Теперь любой текст сюда → озвучу твоим голосом.\n` +
    `Дальше пересылай voice-note кому угодно через стандартный share.`,
    { parse_mode: 'HTML' });
}

async function cmdVoice(chatId) {
  const user = await getBotUser(chatId);
  if (!user) return sendText(chatId, '⚠ Сначала /start @твой_handle XXX-XXX');

  const voice = await queryOne(
    'select * from voices where owner_handle = $1 and archived_at is null order by created_at desc limit 1',
    [user.owner_handle],
  );
  if (!voice) {
    return sendText(chatId,
      `⚠ Голос для <b>${escapeHtml(user.owner_handle)}</b> архивирован.\n` +
      `Создай новый: ${PUBLIC_BASE_URL}/persona-train`,
      { parse_mode: 'HTML' });
  }

  return sendText(chatId,
    `🎙 <b>${escapeHtml(voice.display_name || user.owner_handle)}</b>\n\n` +
    `Owner: <code>${escapeHtml(user.owner_handle)}</code>\n` +
    `Provider: ${voice.provider}\n` +
    `Voice ID: <code>${voice.provider_voice_id}</code>\n` +
    `Создан: ${new Date(voice.created_at).toLocaleString('ru-RU')}\n` +
    `Sample: ${voice.sample_seconds ? voice.sample_seconds + 's' : '—'}`,
    { parse_mode: 'HTML' });
}

async function cmdSettings(chatId) {
  const user = await getBotUser(chatId);
  if (!user) return sendText(chatId, '⚠ Сначала /start @твой_handle XXX-XXX');
  const p = user.preferences || {};
  return sendText(chatId,
    `⚙ <b>Настройки</b>\n\n` +
    `model: <code>${p.model_id || 'eleven_multilingual_v2'}</code>\n` +
    `stability: ${p.stability ?? 0.55}\n` +
    `similarity_boost: ${p.similarity_boost ?? 0.85}\n` +
    `style: ${p.style ?? 0.0}\n\n` +
    `<i>Редактирование — в следующих версиях.</i>`,
    { parse_mode: 'HTML' });
}

async function cmdClear(chatId) {
  await query('delete from voice_bot_users where tg_chat_id = $1', [chatId]);
  return sendText(chatId,
    '✂ Чат отвязан. /start @твой_handle XXX-XXX чтобы привязать заново.');
}

// ═══ Voice generation ══════════════════════════════════════════════

async function generateAndSend(chatId, messageId, text) {
  if (text.length > MAX_INCOMING_LEN) {
    return sendText(chatId,
      `⚠ Слишком длинно (${text.length}). Максимум — ${MAX_INCOMING_LEN} символов.`);
  }

  const user = await getBotUser(chatId);
  if (!user) {
    return sendText(chatId,
      '⚠ Сначала привяжи чат:\n<code>/start @your_handle XXX-XXX</code>',
      { parse_mode: 'HTML' });
  }

  query(
    'update voice_bot_users set last_active_at = now() where tg_chat_id = $1',
    [chatId],
  ).catch(() => {});

  await sendChatAction(chatId, 'record_voice');

  const prefs = user.preferences || {};
  const result = await generateVoiceNote({
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
    return sendText(chatId,
      `❌ Не получилось (${result.code || 'error'}): ${truncate(result.details || '', 200)}`);
  }

  const sendRes = await tgApi('sendVoice', {
    chat_id: chatId,
    voice: result.audioUrl,
    caption: `🤖 ${truncate(text, 150)}`,
    reply_to_message_id: messageId,
    allow_sending_without_reply: true,
  });

  if (!sendRes.ok) {
    // Fallback to sendAudio if Telegram rejects MP3-as-voice.
    const fb = await tgApi('sendAudio', {
      chat_id: chatId,
      audio: result.audioUrl,
      caption: `🤖 (audio) ${truncate(text, 120)}`,
      reply_to_message_id: messageId,
      allow_sending_without_reply: true,
    });
    if (!fb.ok) {
      return sendText(chatId,
        `⚠ Voice сгенерирован, но Telegram отказался принимать.\nСсылка: ${result.audioUrl}`);
    }
  }

  if (result.generationId) {
    markGenerationSent(result.generationId, { tg_chat_id: chatId, tg_message_id: messageId })
      .catch(() => {});
  }
}

// ═══ Telegram helpers ══════════════════════════════════════════════

async function tgApi(method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  } catch (e) {
    console.error('[tg]', method, 'failed:', e.message);
    return { ok: false, status: 502 };
  }
}

function sendText(chatId, text, extra = {}) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

function sendChatAction(chatId, action) {
  return tgApi('sendChatAction', { chat_id: chatId, action });
}

async function answerCallback(cq) {
  return tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'OK' });
}

// ═══ DB helpers ════════════════════════════════════════════════════

async function getBotUser(chatId) {
  return queryOne(
    'select * from voice_bot_users where tg_chat_id = $1',
    [chatId],
  );
}

// ═══ Misc ══════════════════════════════════════════════════════════

function normalizeHandle(s) {
  const t = String(s || '').trim().split(/\s+/)[0];
  if (!t) return null;
  if (t.includes('@') && t.includes('.')) return t.toLowerCase();
  return t.startsWith('@') ? t : '@' + t;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const START_WELCOME = `
🎙 <b>AI Voice Composer</b>

Я озвучиваю текст твоим клонированным голосом и присылаю voice-note сюда.
Дальше пересылай кому угодно — Telegram-нативная пересылка работает идеально.

<b>Как начать:</b>
1. Создай клон голоса: ${PUBLIC_BASE_URL}/persona-train
2. Получи там одноразовый код XXX-XXX
3. Привяжи этот чат: <code>/start @твой_handle XXX-XXX</code>
4. Просто пиши сообщения сюда — я буду озвучивать.

<b>Команды:</b> /help
`.trim();

const HELP_TEXT = `
<b>Команды:</b>
<code>/start @handle XXX-XXX</code> — привязать чат (код с /persona-train)
<code>/voice</code> — показать активный голос
<code>/settings</code> — настройки TTS
<code>/clear</code> — отвязать чат
<code>/help</code> — эта подсказка

Просто пиши любой текст — я озвучу.
Максимум — 1500 символов на сообщение.
`.trim();
