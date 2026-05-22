// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-binding-token.js
// ───────────────────────────────────────────────────────────────────
// POST /api/voice-binding-token  { owner_handle }
//   → { ok, token: "H3K-9PT", expires_at, voice_id }
//
// Issues a single-use, 1-hour-expiring token that proves the bearer
// owns the given owner_handle. Used to bind a Telegram chat to a
// voice via /start command (see tg-voice-webhook.js).
//
// Security:
// · Token is shown ONCE in /persona-train UI right after voice creation.
// · One active token per handle at a time (issuing a new one invalidates
//   prior unused ones for the same handle).
// · Rate-limited to 5 tokens/hour per handle (in-memory, per-instance).
// · Owner_handle must have an active voice in public.voices.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY.
// ═══════════════════════════════════════════════════════════════════

import { sbSelectOne } from './_shared/voice-pipeline.js';

const RATE = new Map();
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

// Avoid ambiguous chars: 0/O, 1/I, 5/S removed.
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY23456789';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function genCode(len = 6) {
  let out = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

function checkRate(handle) {
  const now = Date.now();
  const hour = Math.floor(now / WINDOW_MS);
  const key = `${handle}:${hour}`;
  const count = (RATE.get(key) || 0) + 1;
  RATE.set(key, count);
  for (const k of RATE.keys()) {
    const t = parseInt(k.split(':').pop(), 10);
    if (t < hour - 1) RATE.delete(k);
  }
  return count <= RATE_LIMIT;
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supaUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !serviceKey) return json(503, { error: 'supabase_not_configured' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_json' });
  }

  const ownerHandle = String(body.owner_handle || '').trim();
  if (!ownerHandle) return json(400, { error: 'owner_handle_required' });

  if (!checkRate(ownerHandle)) {
    return json(429, { error: 'rate_limited', max_per_hour: RATE_LIMIT });
  }

  // Ensure voice exists.
  const voice = await sbSelectOne(
    supaUrl,
    serviceKey,
    `/rest/v1/voices?owner_handle=eq.${encodeURIComponent(ownerHandle)}&archived_at=is.null&select=*&order=created_at.desc&limit=1`,
  );
  if (!voice) {
    return json(404, { error: 'no_active_voice', hint: 'Создай голос на /persona-train' });
  }

  // Invalidate previous unused tokens for this handle (single-active policy).
  await fetch(
    `${supaUrl}/rest/v1/voice_binding_tokens?owner_handle=eq.${encodeURIComponent(ownerHandle)}&used_at=is.null`,
    {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ used_at: new Date().toISOString(), used_by_chat_id: null }),
    },
  );

  // Generate unique token (retry on rare collision).
  let token = null;
  for (let i = 0; i < 5; i++) {
    const candidate = genCode(6);
    const insertRes = await fetch(`${supaUrl}/rest/v1/voice_binding_tokens`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        token: candidate,
        owner_handle: ownerHandle,
        voice_id: voice.id,
      }),
    });
    if (insertRes.ok) {
      const [row] = await insertRes.json();
      token = row;
      break;
    }
    // Collision (unique violation) or transient — try again.
  }

  if (!token) {
    return json(500, { error: 'token_insert_failed' });
  }

  return json(200, {
    ok: true,
    token: token.token,
    owner_handle: token.owner_handle,
    voice_id: token.voice_id,
    expires_at: token.expires_at,
  });
};

export const config = { path: '/api/voice-binding-token' };
