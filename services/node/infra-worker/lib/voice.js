// ═══════════════════════════════════════════════════════════════════
// lib/voice.js — ElevenLabs TTS + Telegram sendVoice
// ───────────────────────────────────────────────────────────────────
// MVP уровня: рендерим текст в OGG/Opus через ElevenLabs и шлём
// в Telegram как voice message. voice_id пока берётся из env
// (одна "Аня" на всех). Когда онбординг соберёт 2-мин сэмпл клиента,
// его voice_id можно положить в platform_users.voice_id и передавать
// сюда — функция render() уже принимает voice_id параметром.
// ═══════════════════════════════════════════════════════════════════

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY || '';
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID_ANYA || '';
const TG_TOKEN = process.env.TG_OFFICE_BOT_TOKEN || '';

export function isVoiceConfigured() {
  return Boolean(ELEVENLABS_KEY && DEFAULT_VOICE_ID);
}

/**
 * Render text to voice audio (OGG/Opus 48kHz) via ElevenLabs.
 * @param {string} text
 * @param {string} [voiceId] — override default voice
 * @returns {Promise<{ok:true, buffer:Buffer, mimeType:string} | {ok:false, error:string}>}
 */
export async function renderVoice(text, voiceId = DEFAULT_VOICE_ID) {
  if (!ELEVENLABS_KEY) return { ok: false, error: 'ELEVENLABS_API_KEY missing' };
  if (!voiceId) return { ok: false, error: 'voice_id missing' };
  if (!text || text.trim().length < 2) return { ok: false, error: 'text empty' };

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=opus_48000_64`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/ogg',
    },
    body: JSON.stringify({
      text: text.slice(0, 2000),
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `elevenlabs ${res.status}: ${body.slice(0, 300)}` };
  }
  const arr = await res.arrayBuffer();
  return { ok: true, buffer: Buffer.from(arr), mimeType: 'audio/ogg' };
}

/**
 * Clone a user voice via ElevenLabs Instant Voice Cloning.
 * @param {object} opts
 * @param {Buffer} opts.audioBuffer — webm/ogg/mp3 sample, ≥30 sec is ideal
 * @param {string} opts.audioMime
 * @param {string} opts.name — label shown in ElevenLabs UI (e.g. "Илья · 2026-05-20")
 * @param {string} [opts.description]
 * @returns {Promise<{ok:true, voice_id:string} | {ok:false, error:string}>}
 */
export async function cloneVoice({ audioBuffer, audioMime = 'audio/webm', name, description = 'AI Growth Office onboarding sample' }) {
  if (!ELEVENLABS_KEY) return { ok: false, error: 'ELEVENLABS_API_KEY missing' };
  if (!audioBuffer || audioBuffer.length < 1024) return { ok: false, error: 'audio sample too small' };
  if (audioBuffer.length > 11 * 1024 * 1024) return { ok: false, error: 'audio sample too large (>11MB)' };

  const ext = audioMime.includes('webm') ? 'webm' : audioMime.includes('ogg') ? 'ogg' : audioMime.includes('mp3') ? 'mp3' : 'webm';
  const form = new FormData();
  form.append('name', String(name).slice(0, 64));
  form.append('description', String(description).slice(0, 250));
  form.append('files', new Blob([audioBuffer], { type: audioMime }), `sample.${ext}`);

  const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, error: `elevenlabs ${res.status}: ${body.slice(0, 300)}` };
  }
  const data = await res.json();
  if (!data?.voice_id) {
    return { ok: false, error: `unexpected response: ${JSON.stringify(data).slice(0, 200)}` };
  }
  return { ok: true, voice_id: data.voice_id };
}

/**
 * Render text to mp3 via ElevenLabs (for HeyGen audio-source path).
 * HeyGen /v2/video/generate с voice.type='audio' принимает asset_id
 * с mp3-аудио — выдаём mp3_44100_128.
 *
 * @param {string} text
 * @param {string} voiceId
 * @returns {Promise<{ok:true, buffer:Buffer, mimeType:string} | {ok:false, error:string}>}
 */
export async function renderMp3(text, voiceId) {
  if (!ELEVENLABS_KEY) return { ok: false, error: 'ELEVENLABS_API_KEY missing' };
  if (!voiceId) return { ok: false, error: 'voice_id missing' };
  if (!text || text.trim().length < 2) return { ok: false, error: 'text empty' };

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.slice(0, 2500),
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    return { ok: false, error: `elevenlabs mp3 fetch: ${e.message}` };
  }

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `elevenlabs ${res.status}: ${body.slice(0, 300)}` };
  }
  const arr = await res.arrayBuffer();
  return { ok: true, buffer: Buffer.from(arr), mimeType: 'audio/mpeg' };
}

/**
 * Send an OGG/Opus voice message to Telegram.
 * @param {number|string} chatId
 * @param {Buffer} audioBuffer
 * @param {object} [opts] caption?: string, replyMarkup?: object
 */
export async function sendVoice(chatId, audioBuffer, opts = {}) {
  if (!TG_TOKEN) return { ok: false, error: 'TG_OFFICE_BOT_TOKEN missing' };

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('voice', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
  if (opts.caption) {
    form.append('caption', String(opts.caption).slice(0, 1024));
    form.append('parse_mode', 'HTML');
  }
  if (opts.replyMarkup) {
    form.append('reply_markup', JSON.stringify(opts.replyMarkup));
  }

  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendVoice`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, error: body.slice(0, 400) };
  }
  return await res.json();
}
