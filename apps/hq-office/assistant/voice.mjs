/* Voice of the assistant through ElevenLabs (the key Persona Train already uses):
   speech-to-text (Scribe) for what the owner says, text-to-speech in the owner's cloned voice
   for the replies. Raw HTTP, like apps/persona-train/src/lib/elevenlabs.ts. */
const API = (process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io') + '/v1';
const KEY = process.env.ELEVENLABS_API_KEY || '';
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
// the clone made in Persona Train is found by name when no voice is picked yet
const OWNER_VOICE = /ил[ьи]я|ilia|ilya|пали[йя]|pali/i;

export const voiceConfigured = () => Boolean(KEY);

async function call(p, init = {}) {
  const res = await fetch(API + p, { ...init, headers:{ 'xi-api-key':KEY, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`elevenlabs ${p.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

export async function transcribe(audio, mime) {
  const fd = new FormData();
  fd.append('model_id', STT_MODEL);
  fd.append('language_code', 'ru');
  fd.append('file', new Blob([audio], { type:mime || 'audio/webm' }), /mp4|m4a|aac/.test(mime) ? 'speech.m4a' : 'speech.webm');
  const data = await (await call('/speech-to-text', { method:'POST', body:fd })).json();
  return String(data.text || '').trim();
}

// cloned and professional voices of the account: the owner picks his clone once
export async function listVoices() {
  const data = await (await call('/voices')).json();
  return (data.voices || []).filter(v => ['cloned', 'professional', 'generated'].includes(v.category))
    .map(v => ({ id:v.voice_id, name:v.name, category:v.category }));
}

export async function guessOwnerVoice() {
  const list = await listVoices();
  return list.find(v => OWNER_VOICE.test(v.name)) || null;
}

// returns the fetch Response: its body is an mp3 stream the server pipes to the browser
export function speak(voiceId, text) {
  return call(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
    method:'POST',
    headers:{ 'content-type':'application/json', accept:'audio/mpeg' },
    body:JSON.stringify({ text, model_id:TTS_MODEL, language_code:'ru' }),
  });
}
