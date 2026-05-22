// ═══════════════════════════════════════════════════════════════════
// netlify/functions/_shared/voice-pipeline.js
// ───────────────────────────────────────────────────────────────────
// Shared utilities for the voice pipeline used by both
// /api/voice-generate and /api/tg-voice-webhook.
//
// Folder is prefixed with `_` so Netlify does not deploy it as a
// standalone function — only bundles it as a dependency.
//
// Exports:
//   resolveVoice(supaUrl, key, { voice_id, owner_handle, provider_voice_id })
//   generateTts({ key, providerVoiceId, text, model, stability, similarity, style })
//   uploadVoiceNote(supaUrl, serviceKey, audioBuf, ownerHandle)
//   logGeneration(supaUrl, serviceKey, row)
//   sbSelectOne(supaUrl, key, path)
// ═══════════════════════════════════════════════════════════════════

export const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
export const DEFAULT_MODEL = 'eleven_multilingual_v2';
export const MAX_TEXT_CHARS = 1500;

export function clamp01(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export async function sbSelectOne(supaUrl, key, path) {
  const res = await fetch(`${supaUrl}${path}`, {
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

/**
 * Resolves which provider voice_id to use given any of:
 *   { voice_id }            — our UUID from public.voices
 *   { owner_handle }        — active voice of that owner
 *   { provider_voice_id }   — direct passthrough
 *
 * Returns { voiceRow|null, providerVoiceId|null, error|null }.
 */
export async function resolveVoice(supaUrl, key, { voice_id, owner_handle, provider_voice_id }) {
  if (voice_id) {
    const row = await sbSelectOne(
      supaUrl,
      key,
      `/rest/v1/voices?id=eq.${encodeURIComponent(voice_id)}&select=*`,
    );
    if (!row) return { voiceRow: null, providerVoiceId: null, error: { status: 404, code: 'voice_not_found' } };
    return { voiceRow: row, providerVoiceId: row.provider_voice_id, error: null };
  }
  if (owner_handle && !provider_voice_id) {
    const row = await sbSelectOne(
      supaUrl,
      key,
      `/rest/v1/voices?owner_handle=eq.${encodeURIComponent(owner_handle)}&archived_at=is.null&select=*&order=created_at.desc&limit=1`,
    );
    if (!row) return { voiceRow: null, providerVoiceId: null, error: { status: 404, code: 'no_active_voice_for_owner' } };
    return { voiceRow: row, providerVoiceId: row.provider_voice_id, error: null };
  }
  if (provider_voice_id) {
    return { voiceRow: null, providerVoiceId: provider_voice_id, error: null };
  }
  return { voiceRow: null, providerVoiceId: null, error: { status: 400, code: 'voice_id_or_owner_required' } };
}

/**
 * Calls ElevenLabs TTS.
 * Returns { ok: true, audioBuf, model_id } or { ok: false, status, details }.
 */
export async function generateTts({ key, providerVoiceId, text, model, stability, similarity, style }) {
  const body = {
    text,
    model_id: model || DEFAULT_MODEL,
    voice_settings: {
      stability: clamp01(stability, 0.55),
      similarity_boost: clamp01(similarity, 0.85),
      style: clamp01(style, 0.0),
      use_speaker_boost: true,
    },
  };

  let res;
  try {
    res = await fetch(
      `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(providerVoiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    return { ok: false, status: 502, details: 'eleven_unreachable: ' + (e.message || e) };
  }

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, details: errText.slice(0, 600) };
  }

  const audioBuf = await res.arrayBuffer();
  return { ok: true, audioBuf, model_id: body.model_id };
}

/**
 * Uploads an audio buffer to Supabase Storage bucket voice-notes/.
 * Returns { ok, audioUrl, audioPath, status }.
 */
export async function uploadVoiceNote(supaUrl, serviceKey, audioBuf, ownerHandle) {
  const safeOwner = String(ownerHandle || 'anon').replace(/[^a-z0-9._@-]/gi, '_');
  const path = `${safeOwner}/${Date.now()}.mp3`;

  const res = await fetch(`${supaUrl}/storage/v1/object/voice-notes/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: audioBuf,
  });

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      details: (await res.text()).slice(0, 400),
      audioUrl: null,
      audioPath: null,
    };
  }

  return {
    ok: true,
    audioUrl: `${supaUrl}/storage/v1/object/public/voice-notes/${path}`,
    audioPath: path,
    status: 200,
  };
}

/**
 * Inserts a row into public.voice_generations.
 * Returns generation_id or null on failure.
 */
export async function logGeneration(supaUrl, serviceKey, row) {
  try {
    const res = await fetch(`${supaUrl}/rest/v1/voice_generations`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) return null;
    const [inserted] = await res.json();
    return inserted?.id || null;
  } catch {
    return null;
  }
}

/**
 * End-to-end pipeline used by both /api/voice-generate and the TG bot.
 * Returns { ok, audioBuf, audioUrl, audioPath, generationId, charCount, ... }
 * or { ok: false, status, code, details }.
 */
export async function generateVoiceNote({
  supaUrl, serviceKey, elevenKey,
  text, voice_id, owner_handle, provider_voice_id,
  model, stability, similarity, style,
  source, meta = {},
}) {
  if (!text || !text.trim()) {
    return { ok: false, status: 400, code: 'text_required' };
  }
  if (text.length > MAX_TEXT_CHARS) {
    return { ok: false, status: 400, code: 'text_too_long', details: `max ${MAX_TEXT_CHARS}, got ${text.length}` };
  }

  const { voiceRow, providerVoiceId, error } = await resolveVoice(supaUrl, serviceKey, {
    voice_id, owner_handle, provider_voice_id,
  });
  if (error) return { ok: false, ...error };

  const tts = await generateTts({
    key: elevenKey, providerVoiceId, text, model, stability, similarity, style,
  });
  if (!tts.ok) {
    return { ok: false, status: tts.status, code: 'eleven_tts_failed', details: tts.details };
  }

  const owner = voiceRow?.owner_handle || owner_handle || 'anon';
  const uploaded = await uploadVoiceNote(supaUrl, serviceKey, tts.audioBuf, owner);

  const generationId = await logGeneration(supaUrl, serviceKey, {
    voice_id: voiceRow?.id || null,
    owner_handle: owner,
    text,
    audio_path: uploaded.ok ? uploaded.audioPath : null,
    audio_url: uploaded.ok ? uploaded.audioUrl : null,
    status: uploaded.ok ? 'generated' : 'failed',
    source: source || 'api',
    meta: { ...meta, model_id: tts.model_id, char_count: text.length, provider_voice_id: providerVoiceId, upload_status: uploaded.status },
  });

  if (!uploaded.ok) {
    return {
      ok: false,
      status: 500,
      code: 'storage_upload_failed',
      details: uploaded.details,
      generationId,
    };
  }

  return {
    ok: true,
    audioBuf: tts.audioBuf,
    audioUrl: uploaded.audioUrl,
    audioPath: uploaded.audioPath,
    generationId,
    charCount: text.length,
    bytes: tts.audioBuf.byteLength,
    providerVoiceId,
    voiceRow,
  };
}
