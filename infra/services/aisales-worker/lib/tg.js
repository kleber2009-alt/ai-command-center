// ═══════════════════════════════════════════════════════════════════
// lib/tg.js — Telegram Bot API helpers for the office worker
// ───────────────────────────────────────────────────────────────────
// Uses TG_OFFICE_BOT_TOKEN — the new "AI Growth Office" bot,
// separate from voice-bot / tg-agent. Created manually via @BotFather.
// ═══════════════════════════════════════════════════════════════════

const TOKEN = process.env.TG_OFFICE_BOT_TOKEN;
// Альтернативный бот для viral_clone delivery — @your_transscribe_bot.
const TRANSCRIBE_TOKEN = process.env.TG_TRANSCRIBE_BOT_TOKEN || '';
// Отдельный bot-frontend для парсера ниши (viral_discover) — @your_parser_bot.
// Свой onboarding wizard, свои команды, отдельный webhook /worker/parser-webhook.
const PARSER_TOKEN = process.env.TG_PARSER_BOT_TOKEN || '';

export function isTgConfigured() {
  return Boolean(TOKEN);
}

export function isParserBotConfigured() {
  return Boolean(PARSER_TOKEN);
}

function pickToken(bot) {
  if (bot === 'transcribe') return { token: TRANSCRIBE_TOKEN, envName: 'TG_TRANSCRIBE_BOT_TOKEN' };
  if (bot === 'parser')     return { token: PARSER_TOKEN,     envName: 'TG_PARSER_BOT_TOKEN' };
  return                          { token: TOKEN,            envName: 'TG_OFFICE_BOT_TOKEN' };
}

async function tgApi(method, payload, opts = {}) {
  const { token, envName } = pickToken(opts.bot);
  if (!token) {
    return { ok: false, error: `${envName} missing` };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
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

/**
 * Send a plain text message.
 * Returns { ok, result } from Telegram API (or { ok:false, error }).
 */
export async function sendText(chatId, text, opts = {}) {
  const { bot, ...rest } = opts;
  return tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...rest,
  }, { bot });
}

/**
 * Send a deliverable with feedback buttons:
 *   [✅ Использовал] [❌ Не пригодилось]
 * Callback data is "d:used:<id>" / "d:nope:<id>" — the office bot's
 * webhook handler maps that to deliverables.used_at update.
 */
export async function sendDeliverable(chatId, deliverableId, text, opts = {}) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Использовал', callback_data: `d:used:${deliverableId}` },
          { text: '❌ Не пригодилось', callback_data: `d:nope:${deliverableId}` },
        ],
      ],
    },
  }, { bot: opts.bot });
}

/**
 * Send a local file as a TG document (e.g. processed MP4).
 * Uses multipart/form-data; TG limit for bot uploads is 50 MB.
 * @param {number|string} chatId
 * @param {Buffer} buffer
 * @param {object} [opts]
 *   - filename?: string
 *   - caption?: string
 *   - replyMarkup?: object
 *   - mimeType?: string
 *   - bot?: 'office' | 'transcribe'   — какой бот использовать (default 'office')
 */
export async function sendDocument(chatId, buffer, opts = {}) {
  const { token, envName } = pickToken(opts.bot);
  if (!token) {
    return { ok: false, error: `${envName} missing` };
  }

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append(
    'document',
    new Blob([buffer], { type: opts.mimeType || 'video/mp4' }),
    opts.filename || 'video.mp4',
  );
  if (opts.caption) {
    form.append('caption', String(opts.caption).slice(0, 1024));
    form.append('parse_mode', 'HTML');
  }
  if (opts.replyMarkup) {
    form.append('reply_markup', JSON.stringify(opts.replyMarkup));
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
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
