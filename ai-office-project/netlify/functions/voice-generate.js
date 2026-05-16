// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-generate.js
// ───────────────────────────────────────────────────────────────────
// POST /api/voice-generate — TTS клонированным голосом через ElevenLabs.
//
// Body (JSON):
//   { text, voice_id?, provider_voice_id?, owner_handle?,
//     model_id?, stability?, similarity_boost?, source? }
//
// Передаётся либо voice_id (наш UUID из public.voices), либо
// provider_voice_id (id от ElevenLabs напрямую — для тестов).
// Если задан только owner_handle — берётся активный голос владельца.
//
// Делает:
//   1. Резолвит provider_voice_id (наш ID → ElevenLabs ID)
//   2. ElevenLabs POST /v1/text-to-speech/{id} → mp3
//   3. Загружает mp3 в Supabase Storage bucket voice-notes/{owner}/{ts}.mp3
//   4. Пишет лог в public.voice_generations
//   5. Возвращает { audio_url, audio_path, generation_id, char_count }
//
// Env vars:
//   ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
// ═══════════════════════════════════════════════════════════════════

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_multilingual_v2'; // лучший для русского
const MAX_TEXT_CHARS = 1500;                    // защита от случайной траты кредитов

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
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!ELEVEN_KEY) return json(503, { error: 'eleven_not_configured' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json(503, { error: 'supabase_not_configured' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_request', message: 'Invalid JSON' });
  }

  const text = String(body.text || '').trim();
  if (!text) return json(400, { error: 'text_required' });
  if (text.length > MAX_TEXT_CHARS) {
    return json(400, { error: 'text_too_long', max: MAX_TEXT_CHARS, got: text.length });
  }

  // ── Resolve voice ──
  let voiceRow = null;
  let providerVoiceId = body.provider_voice_id || null;

  if (body.voice_id) {
    voiceRow = await sbSelectOne(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY,
      `/rest/v1/voices?id=eq.${encodeURIComponent(body.voice_id)}&select=*`,
    );
    if (!voiceRow) return json(404, { error: 'voice_not_found', voice_id: body.voice_id });
    providerVoiceId = voiceRow.provider_voice_id;
  } else if (body.owner_handle && !providerVoiceId) {
    voiceRow = await sbSelectOne(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY,
      `/rest/v1/voices?owner_handle=eq.${encodeURIComponent(body.owner_handle)}&archived_at=is.null&select=*&order=created_at.desc&limit=1`,
    );
    if (!voiceRow) {
      return json(404, { error: 'no_active_voice_for_owner', owner_handle: body.owner_handle });
    }
    providerVoiceId = voiceRow.provider_voice_id;
  }

  if (!providerVoiceId) {
    return json(400, { error: 'voice_id_or_owner_required' });
  }

  // ── ElevenLabs TTS ──
  const ttsBody = {
    text,
    model_id: body.model_id || DEFAULT_MODEL,
    voice_settings: {
      stability: clamp01(body.stability, 0.55),
      similarity_boost: clamp01(body.similarity_boost, 0.85),
      style: clamp01(body.style, 0.0),
      use_speaker_boost: true,
    },
  };

  let ttsRes;
  try {
    ttsRes = await fetch(
      `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(providerVoiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVEN_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(ttsBody),
      },
    );
  } catch (e) {
    return json(502, { error: 'eleven_unreachable', message: String(e?.message || e) });
  }

  if (!ttsRes.ok) {
    const errText = await ttsRes.text();
    return json(ttsRes.status, {
      error: 'eleven_tts_failed',
      status: ttsRes.status,
      details: errText.slice(0, 600),
    });
  }

  const audioBuf = await ttsRes.arrayBuffer();

  // ── Upload to Supabase Storage ──
  const owner = voiceRow?.owner_handle || body.owner_handle || 'anon';
  const safeOwner = owner.replace(/[^a-z0-9._@-]/gi, '_');
  const path = `${safeOwner}/${Date.now()}.mp3`;

  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/voice-notes/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true',
      },
      body: audioBuf,
    },
  );

  let audioUrl = null;
  if (uploadRes.ok) {
    audioUrl = `${SUPABASE_URL}/storage/v1/object/public/voice-notes/${path}`;
  }

  // ── Log generation (best-effort) ──
  let generationId = null;
  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/voice_generations`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        voice_id: voiceRow?.id || null,
        owner_handle: owner,
        text,
        audio_path: uploadRes.ok ? path : null,
        audio_url: audioUrl,
        status: uploadRes.ok ? 'generated' : 'failed',
        source: body.source || 'api',
        meta: {
          model_id: ttsBody.model_id,
          char_count: text.length,
          provider_voice_id: providerVoiceId,
          upload_status: uploadRes.status,
        },
      }),
    });
    if (insertRes.ok) {
      const [row] = await insertRes.json();
      generationId = row.id;
    }
  } catch (e) {
    // лог не критичен
  }

  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    return json(500, {
      error: 'storage_upload_failed',
      status: uploadRes.status,
      details: txt.slice(0, 400),
      hint: 'Создан ли bucket voice-notes? См. supabase/migrations/003_voice.sql',
    });
  }

  return json(200, {
    ok: true,
    generation_id: generationId,
    audio_url: audioUrl,
    audio_path: path,
    char_count: text.length,
    bytes: audioBuf.byteLength,
    provider_voice_id: providerVoiceId,
  });
};

function clamp01(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

async function sbSelectOne(url, key, path) {
  const res = await fetch(`${url}${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export const config = { path: '/api/voice-generate' };
