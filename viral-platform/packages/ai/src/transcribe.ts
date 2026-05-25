import { createClient } from '@deepgram/sdk';
import type { Transcript, TranscriptWord } from '@vp/shared';

let client: ReturnType<typeof createClient> | undefined;
function getClient() {
  if (!client) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set');
    client = createClient(apiKey);
  }
  return client;
}

/**
 * Transcribe a WAV buffer with Deepgram Nova-3, returning word-level timings,
 * speakers, and paragraphs (§5.2). AssemblyAI / Whisper fallbacks are wired in
 * the transcribe worker, not here.
 */
export async function transcribeAudio(audio: Buffer): Promise<Transcript> {
  const { result, error } = await getClient().listen.prerecorded.transcribeFile(audio, {
    model: 'nova-3',
    smart_format: true,
    diarize: true,
    punctuate: true,
    paragraphs: true,
  });
  if (error) throw new Error(`deepgram: ${error.message ?? String(error)}`);

  const channel = result?.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  if (!alt) throw new Error('deepgram returned no alternatives');

  const words: TranscriptWord[] = (alt.words ?? []).map((w) => ({
    word: w.punctuated_word ?? w.word,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
    speaker: w.speaker,
    confidence: w.confidence,
  }));

  const speakers = new Set(words.map((w) => w.speaker).filter((s) => s !== undefined));

  return {
    language: result?.results?.channels?.[0]?.detected_language ?? 'en',
    speakersCount: Math.max(1, speakers.size),
    words,
    paragraphs: alt.paragraphs?.paragraphs?.map((p) => ({
      startMs: Math.round(p.start * 1000),
      endMs: Math.round(p.end * 1000),
      text: p.sentences.map((s) => s.text).join(' '),
    })),
  };
}
