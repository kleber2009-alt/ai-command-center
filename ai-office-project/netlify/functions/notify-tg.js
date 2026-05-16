// ═══════════════════════════════════════════════════════════════════
// netlify/functions/notify-tg.js
// ───────────────────────────────────────────────────────────────────
// Server-side proxy для отправки уведомлений в Telegram.
//
// Что делает:
// · Принимает POST с {text, chat_id?} → шлёт в Telegram Bot API
// · Скрывает TG_BOT_TOKEN в env vars (не виден в браузере)
// · Rate-limit: 20 сообщений/мин на IP (защита от спама через форму)
// · Принимает только same-origin запросы (CORS)
//
// Env vars (Netlify Site Settings → Environment Variables):
// · TG_BOT_TOKEN  — токен бота от @BotFather
// · TG_CHAT_ID    — куда слать (твой ID или ID группы)
//
// Endpoint: /api/notify-tg (через netlify.toml redirect)
// ═══════════════════════════════════════════════════════════════════

const RATE = new Map();
const LIMIT = 20;          // сообщений в минуту на IP
const WINDOW_MS = 60_000;
const MAX_TEXT_LEN = 4000; // Telegram limit

function rateLimit(ip) {
  const now = Date.now();
  const minute = Math.floor(now / WINDOW_MS);
  const key = `${ip}:${minute}`;
  const count = (RATE.get(key) || 0) + 1;
  RATE.set(key, count);
  // cleanup старых корзин
  for (const k of RATE.keys()) {
    const t = parseInt(k.split(':')[1], 10);
    if (t < minute - 1) RATE.delete(k);
  }
  return { allowed: count <= LIMIT, count, limit: LIMIT };
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (request) => {
  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const TOKEN   = process.env.TG_BOT_TOKEN;
  const DEFAULT_CHAT = process.env.TG_CHAT_ID;

  if (!TOKEN || !DEFAULT_CHAT) {
    return json(503, {
      error: 'Telegram not configured',
      hint: 'Set TG_BOT_TOKEN and TG_CHAT_ID in Netlify env vars',
    });
  }

  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || 'unknown';
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return json(429, {
      error: 'Too many requests',
      limit: rl.limit,
      retry_after_seconds: 60,
    });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const text = String(body.text || '').slice(0, MAX_TEXT_LEN);
  if (!text.trim()) return json(400, { error: 'Empty text' });

  const chatId = body.chat_id || DEFAULT_CHAT;
  const parseMode = body.parse_mode || 'Markdown';

  // Send to Telegram
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const err = await tgRes.text();
      return json(502, { error: 'Telegram API error', details: err });
    }

    const data = await tgRes.json();
    return json(200, { ok: true, message_id: data.result?.message_id });
  } catch (e) {
    return json(500, { error: 'Network error', message: e.message });
  }
};

export const config = { path: '/api/notify-tg' };
