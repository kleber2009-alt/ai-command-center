// Пословные таймкоды для монтажа (скилл: faster-whisper large-v3). Тот же выбор
// backend, что и в research/transcribe.ts: WHISPER_SERVICE_URL (self-hosted,
// OpenAI-совместимый faster-whisper-server) → OPENAI_API_KEY (whisper-1).
// Нужен verbose_json + timestamp_granularities[]=word.

import { readFile } from 'node:fs/promises';
import { env } from '@/lib/env';
import type { Word } from './edl';
import { OPENAI_BASE } from '@/lib/provider-urls';

export class TranscribeWordsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'TranscribeWordsError';
  }
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // лимит OpenAI Whisper API

export function hasWordTranscriber(): boolean {
  return Boolean(process.env.WHISPER_SERVICE_URL || env.OPENAI_API_KEY);
}

export async function transcribeWords(audioPath: string, lang = 'ru'): Promise<Word[]> {
  const selfHosted = process.env.WHISPER_SERVICE_URL;
  const baseUrl = selfHosted || OPENAI_BASE;
  const apiKey = selfHosted ? process.env.WHISPER_API_KEY : env.OPENAI_API_KEY;
  const model = selfHosted ? process.env.WHISPER_MODEL || 'Systran/faster-whisper-small' : env.OPENAI_WHISPER_MODEL;
  if (!selfHosted && !apiKey) {
    throw new TranscribeWordsError('NO_TRANSCRIBER', 'Нет WHISPER_SERVICE_URL / OPENAI_API_KEY — нечем получить пословные таймкоды.');
  }

  const audio = await readFile(audioPath);
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new TranscribeWordsError('AUDIO_TOO_LARGE', `Аудио ${Math.round(audio.length / 1e6)} МБ > 25 МБ`);
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', model);
  form.append('language', lang);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    body: form,
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new TranscribeWordsError(`HTTP_${res.status}`, txt.slice(0, 300) || `whisper HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    words?: { word: string; start: number; end: number }[];
    segments?: { words?: { word: string; start: number; end: number }[] }[];
  };
  // OpenAI отдаёт words верхним уровнем, faster-whisper-server — внутри segments
  const raw = json.words ?? json.segments?.flatMap((s) => s.words ?? []) ?? [];
  return raw
    .map((x) => ({ w: String(x.word).trim(), s: Number(x.start), e: Number(x.end) }))
    .filter((x) => x.w && Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s);
}
