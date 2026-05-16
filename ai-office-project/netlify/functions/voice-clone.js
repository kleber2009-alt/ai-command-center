// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-clone.js
// ───────────────────────────────────────────────────────────────────
// POST /api/voice-clone — клонирование голоса через ElevenLabs Instant
// Voice Clone.
//
// Принимает multipart/form-data:
//   files[]        — одно или несколько аудио (mp3/m4a/wav/ogg, до 11MB суммарно)
//   owner_handle   — @username или email — владелец голоса (уникальный ключ)
//   display_name?  — человекочитаемое имя голоса (default = owner_handle)
//   sample_seconds?— подсказка о длительности (для UI/аналитики)
//
// Делает:
//   1. Архивирует прошлый голос владельца (если был)
//   2. Форвардит файлы в ElevenLabs POST /v1/voices/add
//   3. Сохраняет { provider_voice_id } в Supabase public.voices
//   4. Возвращает { voice_id, provider_voice_id, display_name }
//
// Env vars:
//   ELEVENLABS_API_KEY    — ключ от api.elevenlabs.io
//   SUPABASE_URL          — https://xxx.supabase.co
//   SUPABASE_SERVICE_KEY  — service_role key (bypass RLS, НЕ светить клиенту)
// ═══════════════════════════════════════════════════════════════════

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const MAX_TOTAL_BYTES = 11 * 1024 * 1024; // ElevenLabs hard cap

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
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!ELEVEN_KEY) {
    return json(503, {
      error: 'eleven_not_configured',
      hint: 'Set ELEVENLABS_API_KEY in Netlify env vars',
    });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(503, {
      error: 'supabase_not_configured',
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Netlify env vars',
    });
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json(400, { error: 'bad_request', message: 'Expected multipart/form-data' });
  }

  const ownerHandle = String(form.get('owner_handle') || '').trim();
  if (!ownerHandle) return json(400, { error: 'owner_handle_required' });

  const displayName = String(form.get('display_name') || ownerHandle).trim().slice(0, 80);
  const sampleSeconds = parseInt(form.get('sample_seconds'), 10) || null;

  const files = form.getAll('files').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f);
  if (!files.length) return json(400, { error: 'no_audio_files' });

  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return json(413, {
      error: 'payload_too_large',
      max_mb: MAX_TOTAL_BYTES / 1024 / 1024,
      got_mb: +(totalBytes / 1024 / 1024).toFixed(2),
    });
  }

  // ── 1. Forward to ElevenLabs ──
  const elevenForm = new FormData();
  elevenForm.append('name', displayName);
  elevenForm.append('description', `AI Growth Office voice clone for ${ownerHandle}`);
  for (const file of files) {
    elevenForm.append('files', file, file.name || 'sample.mp3');
  }

  let cloneRes;
  try {
    cloneRes = await fetch(`${ELEVENLABS_API}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVEN_KEY },
      body: elevenForm,
    });
  } catch (e) {
    return json(502, { error: 'eleven_unreachable', message: String(e?.message || e) });
  }

  if (!cloneRes.ok) {
    const text = await cloneRes.text();
    return json(cloneRes.status, {
      error: 'eleven_clone_failed',
      status: cloneRes.status,
      details: text.slice(0, 600),
    });
  }

  const cloneData = await cloneRes.json();
  const providerVoiceId = cloneData.voice_id;
  if (!providerVoiceId) {
    return json(502, { error: 'eleven_no_voice_id', details: cloneData });
  }

  // ── 2. Archive previous active voice for this owner ──
  await sbFetch(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    method: 'PATCH',
    path: `/rest/v1/voices?owner_handle=eq.${encodeURIComponent(ownerHandle)}&archived_at=is.null`,
    body: { archived_at: new Date().toISOString() },
  });

  // ── 3. Insert new voice row ──
  const insertRes = await sbFetch(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    method: 'POST',
    path: '/rest/v1/voices',
    headers: { Prefer: 'return=representation' },
    body: {
      owner_handle: ownerHandle,
      display_name: displayName,
      provider: 'elevenlabs',
      provider_voice_id: providerVoiceId,
      sample_seconds: sampleSeconds,
    },
  });

  if (!insertRes.ok) {
    const txt = await insertRes.text();
    return json(500, {
      error: 'supabase_insert_failed',
      status: insertRes.status,
      details: txt.slice(0, 400),
      provider_voice_id: providerVoiceId,
    });
  }

  const [row] = await insertRes.json();
  return json(200, {
    ok: true,
    voice_id: row.id,
    provider_voice_id: row.provider_voice_id,
    display_name: row.display_name,
    owner_handle: row.owner_handle,
    created_at: row.created_at,
  });
};

async function sbFetch(url, key, { method, path, body, headers = {} }) {
  return fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const config = { path: '/api/voice-clone' };
