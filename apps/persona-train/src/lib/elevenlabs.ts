export const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
export const DEFAULT_MODEL = 'eleven_multilingual_v2';

const API_KEY = process.env.ELEVENLABS_API_KEY;

export function isConfigured(): boolean {
  return Boolean(API_KEY);
}

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export type CloneFile = { buffer: ArrayBuffer | Buffer; filename: string };

export type CloneResult =
  | { ok: true; providerVoiceId: string }
  | { ok: false; status: number; details: string };

export async function cloneVoice({
  name,
  description,
  files,
}: {
  name: string;
  description?: string;
  files: CloneFile[];
}): Promise<CloneResult> {
  if (!API_KEY) return { ok: false, status: 503, details: 'ELEVENLABS_API_KEY missing' };

  const fd = new FormData();
  fd.append('name', name);
  if (description) fd.append('description', description);
  for (const f of files) {
    const buf = f.buffer instanceof ArrayBuffer ? f.buffer : new Uint8Array(f.buffer).buffer;
    fd.append('files', new Blob([buf]), f.filename || 'sample.mp3');
  }

  let res: Response;
  try {
    res = await fetch(`${ELEVENLABS_API}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY },
      body: fd,
    });
  } catch (e) {
    return { ok: false, status: 502, details: 'eleven_unreachable: ' + (e as Error).message };
  }

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, details: text.slice(0, 600) };
  }

  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) return { ok: false, status: 502, details: 'no_voice_id' };
  return { ok: true, providerVoiceId: data.voice_id };
}

export type TtsResult =
  | { ok: true; audioBuf: ArrayBuffer; modelId: string }
  | { ok: false; status: number; details: string };

export async function generateTts({
  providerVoiceId,
  text,
  model,
  stability,
  similarity,
  style,
  outputFormat = 'mp3_44100_128',
}: {
  providerVoiceId: string;
  text: string;
  model?: string;
  stability?: number;
  similarity?: number;
  style?: number;
  outputFormat?: 'mp3_44100_128' | 'opus_48000_64';
}): Promise<TtsResult> {
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

  let res: Response;
  try {
    res = await fetch(
      `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(providerVoiceId)}?output_format=${outputFormat}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
          Accept: outputFormat.startsWith('opus') ? 'audio/ogg' : 'audio/mpeg',
        },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    return { ok: false, status: 502, details: 'eleven_unreachable: ' + (e as Error).message };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, details: (await res.text()).slice(0, 600) };
  }

  const audioBuf = await res.arrayBuffer();
  return { ok: true, audioBuf, modelId: body.model_id };
}

export async function deleteVoice(providerVoiceId: string): Promise<{ ok: boolean; details?: string }> {
  if (!API_KEY) return { ok: false, details: 'ELEVENLABS_API_KEY missing' };
  try {
    const res = await fetch(`${ELEVENLABS_API}/voices/${encodeURIComponent(providerVoiceId)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': API_KEY },
    });
    if (!res.ok) return { ok: false, details: (await res.text()).slice(0, 200) };
    return { ok: true };
  } catch (e) {
    return { ok: false, details: (e as Error).message };
  }
}
