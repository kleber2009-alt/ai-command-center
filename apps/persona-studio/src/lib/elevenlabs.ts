// ElevenLabs TTS — text + voice_id → mp3 bytes.
//
// Endpoint:
//   POST {ELEVENLABS_API_BASE}/text-to-speech/{voice_id}
//        xi-api-key: <ELEVENLABS_API_KEY>
//        Content-Type: application/json
//        body: { text, model_id, voice_settings }
//        → audio/mpeg bytes
//
// Модель по умолчанию — eleven_turbo_v2_5 (multilingual ru/en, fastest).
// Timeout через AbortController — управляется ELEVENLABS_TTS_TIMEOUT_MS
// или явным `timeoutMs` параметром.

import { env } from './env';

export class ElevenlabsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ElevenlabsError';
  }
}

export type TtsOpts = {
  text: string;
  voiceId: string;
  model?: string;
  /** override env.ELEVENLABS_TTS_TIMEOUT_MS */
  timeoutMs?: number;
  /** voice_settings.stability — 0..1, default 0.5 */
  stability?: number;
  /** voice_settings.similarity_boost — 0..1, default 0.75 */
  similarityBoost?: number;
  /** voice_settings.style — 0..1, default 0.0 */
  style?: number;
  /** voice_settings.use_speaker_boost — default true */
  useSpeakerBoost?: boolean;
};

export async function synthesize(opts: TtsOpts): Promise<{ bytes: Buffer; mime: string }> {
  if (!opts.text || opts.text.trim().length < 1) {
    throw new ElevenlabsError('EMPTY_TEXT', 'text is empty');
  }
  if (!opts.voiceId) throw new ElevenlabsError('MISSING_VOICE', 'voiceId required');

  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ElevenlabsError('MISSING_KEY', 'ELEVENLABS_API_KEY is not set');

  const model = opts.model ?? env.ELEVENLABS_MODEL;
  const timeoutMs = opts.timeoutMs ?? env.ELEVENLABS_TTS_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `${env.ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(opts.voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: opts.text,
          model_id: model,
          voice_settings: {
            stability: opts.stability ?? 0.5,
            similarity_boost: opts.similarityBoost ?? 0.75,
            style: opts.style ?? 0.0,
            use_speaker_boost: opts.useSpeakerBoost ?? true,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new ElevenlabsError(`HTTP_${res.status}`, errText.slice(0, 500));
    }

    const ab = await res.arrayBuffer();
    return {
      bytes: Buffer.from(ab),
      mime: res.headers.get('content-type') ?? 'audio/mpeg',
    };
  } catch (e) {
    if (e instanceof ElevenlabsError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ElevenlabsError('TIMEOUT', `ElevenLabs TTS timeout after ${timeoutMs}ms`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new ElevenlabsError('FETCH_ERR', msg);
  } finally {
    clearTimeout(timer);
  }
}
