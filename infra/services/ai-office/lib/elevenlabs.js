// ═══════════════════════════════════════════════════════════════════
// lib/elevenlabs.js — ElevenLabs API wrapper
// ═══════════════════════════════════════════════════════════════════

export const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
export const DEFAULT_MODEL = 'eleven_multilingual_v2';

const API_KEY = process.env.ELEVENLABS_API_KEY;

export function isConfigured() {
  return Boolean(API_KEY);
}

function clamp01(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/**
 * Clone a voice from one or more audio files.
 * `files` is an array of { buffer, filename }.
 * Returns { ok, providerVoiceId } or { ok: false, status, details }.
 */
export async function cloneVoice({ name, description, files }) {
  if (!API_KEY) return { ok: false, status: 503, details: 'ELEVENLABS_API_KEY missing' };

  const fd = new FormData();
  fd.append('name', name);
  if (description) fd.append('description', description);
  for (const f of files) {
    fd.append('files', new Blob([f.buffer]), f.filename || 'sample.mp3');
  }

  let res;
  try {
    res = await fetch(`${ELEVENLABS_API}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY },
      body: fd,
    });
  } catch (e) {
    return { ok: false, status: 502, details: 'eleven_unreachable: ' + (e.message || e) };
  }

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, details: text.slice(0, 600) };
  }

  const data = await res.json();
  if (!data.voice_id) return { ok: false, status: 502, details: 'no_voice_id' };
  return { ok: true, providerVoiceId: data.voice_id };
}

/**
 * Text-to-speech via cloned voice.
 * Returns { ok, audioBuf, modelId } or { ok: false, status, details }.
 */
export async function generateTts({ providerVoiceId, text, model, stability, similarity, style }) {
  if (!API_KEY) return { ok: false, status: 503, details: 'ELEVENLABS_API_KEY missing' };

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
          'xi-api-key': API_KEY,
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
    return { ok: false, status: res.status, details: (await res.text()).slice(0, 600) };
  }

  const audioBuf = await res.arrayBuffer();
  return { ok: true, audioBuf, modelId: body.model_id };
}
