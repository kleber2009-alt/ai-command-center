// ElevenLabs TTS — text + voice_id → mp3 bytes.
//
// Endpoint (validated via ElevenLabs API docs):
//   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
//        xi-api-key: <ELEVENLABS_API_KEY>
//        Content-Type: application/json
//        body: { text, model_id, voice_settings }
//        → audio/mpeg bytes
//
// Model: 'eleven_turbo_v2_5' — multilingual (ru/en/etc), быстрее v2, дешевле.
//
// OmniHuman лимит — 30 секунд аудио. ElevenLabs Turbo v2.5 даёт ~150 wpm,
// ~12 секунд на 30 слов; ставим soft-cap на 400 символов в воркере.

const ELEVEN_BASE = process.env.ELEVENLABS_API_BASE ?? 'https://api.elevenlabs.io/v1';
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5';

const SUBMIT_TIMEOUT_MS = 60_000;

export class ElevenlabsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ElevenlabsError';
  }
}

function keyOrThrow(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new ElevenlabsError('MISSING_KEY', 'ELEVENLABS_API_KEY is not set');
  return k;
}

export type TtsOpts = {
  text: string;
  voiceId: string;
  /** Override model — default eleven_turbo_v2_5. */
  model?: string;
  /** voice_settings.stability — 0..1, default 0.5. */
  stability?: number;
  /** voice_settings.similarity_boost — 0..1, default 0.75. */
  similarityBoost?: number;
};

/**
 * Synthesize speech. Returns mp3 bytes.
 */
export async function synthesize(opts: TtsOpts): Promise<{ bytes: Buffer; mime: string }> {
  const key = keyOrThrow();
  if (!opts.text || opts.text.trim().length < 1) {
    throw new ElevenlabsError('EMPTY_TEXT', 'text is empty');
  }
  if (!opts.voiceId) throw new ElevenlabsError('MISSING_VOICE', 'voiceId required');

  const body = {
    text: opts.text,
    model_id: opts.model ?? ELEVEN_MODEL,
    voice_settings: {
      stability: opts.stability ?? 0.5,
      similarity_boost: opts.similarityBoost ?? 0.75,
    },
  };

  const res = await fetch(
    `${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(opts.voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
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
}
