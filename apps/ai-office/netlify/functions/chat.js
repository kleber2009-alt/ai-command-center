// ═══════════════════════════════════════════════════════════════════════
// netlify/functions/chat.js
// ───────────────────────────────────────────────────────────────────────
// Server-side proxy for Anthropic Messages API.
// · Hides ANTHROPIC_API_KEY (stays in Netlify env vars, never sent to client)
// · Streams response back to browser (SSE)
// · Rate limits each IP to 10 requests per minute (in-memory, per-instance)
// · Routed at /api/chat via the `config.path` export below.
// ═══════════════════════════════════════════════════════════════════════

const RATE = new Map();
const LIMIT = 10;   // requests per minute per IP
const WINDOW_MS = 60_000;

function rateLimit(ip) {
  const now = Date.now();
  const minute = Math.floor(now / WINDOW_MS);
  const key = `${ip}:${minute}`;
  const count = (RATE.get(key) || 0) + 1;
  RATE.set(key, count);
  // Cleanup buckets older than the previous minute
  for (const k of RATE.keys()) {
    const t = parseInt(k.split(':')[1], 10);
    if (t < minute - 1) RATE.delete(k);
  }
  return { allowed: count <= LIMIT, count, limit: LIMIT };
}

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      ...extraHeaders,
    },
  });
}

export default async (req, context) => {
  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed. Use POST.' });
  }

  // ── Rate limit by IP ──
  const ip =
    (context && context.ip) ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return jsonResponse(
      429,
      {
        error: 'rate_limit_exceeded',
        message: `Превышен лимит ${LIMIT} запросов в минуту. Попробуй через минуту.`,
        retry_after_seconds: 60,
      },
      { 'Retry-After': '60' },
    );
  }

  // ── Get API key from Netlify env ──
  const apiKey =
    (typeof Netlify !== 'undefined' && Netlify.env && Netlify.env.get('ANTHROPIC_API_KEY')) ||
    process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: 'server_misconfigured',
      message:
        'ANTHROPIC_API_KEY не задан в env-переменных Netlify. Добавь его в Site Settings → Build & deploy → Environment.',
    });
  }

  // ── Validate body ──
  let bodyText;
  try {
    bodyText = await req.text();
    const parsed = JSON.parse(bodyText);
    if (!parsed.messages || !Array.isArray(parsed.messages)) {
      return jsonResponse(400, { error: 'bad_request', message: 'Body must include messages[]' });
    }
  } catch (e) {
    return jsonResponse(400, { error: 'bad_request', message: 'Invalid JSON body' });
  }

  // ── Forward to Anthropic ──
  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: bodyText,
    });
  } catch (e) {
    return jsonResponse(502, {
      error: 'upstream_failed',
      message: 'Не удалось связаться с Anthropic API: ' + (e.message || e),
    });
  }

  // ── Stream response back to browser ──
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'X-RateLimit-Limit': String(LIMIT),
      'X-RateLimit-Remaining': String(Math.max(0, LIMIT - rl.count)),
    },
  });
};

// File-based config: this function is reachable at /api/chat
export const config = {
  path: '/api/chat',
};
