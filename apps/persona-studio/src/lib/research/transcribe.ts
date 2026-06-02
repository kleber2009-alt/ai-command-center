// Транскрибация ролика. Шим над OpenAI-compatible /v1/audio/transcriptions:
//
//   1. WHISPER_SERVICE_URL — self-hosted faster-whisper (ТЗ §6.1), если
//      когда-то поднимем контейнер. Имеет приоритет.
//   2. OPENAI_API_KEY — Whisper API на api.openai.com (текущий выбор
//      для v1: $0.006/мин, никакой инфры).
//   3. Иначе — caption ролика как «транскрипт-заглушка»
//      (source='caption'), чтобы analyze не блокировался.

import { env } from '@/lib/env';
import { claudeChat } from './claude';

const OPENAI_WHISPER_URL = 'https://api.openai.com';

type WhisperConfig =
  | { kind: 'self-hosted'; baseUrl: string; apiKey?: string; model: string }
  | { kind: 'openai'; apiKey: string; model: string }
  | { kind: 'none' };

// Решаем backend по env. self-hosted имеет приоритет, чтобы при появлении
// контейнера он автоматически перехватывал трафик без правки кода.
function pickBackend(): WhisperConfig {
  const selfHosted = process.env.WHISPER_SERVICE_URL;
  if (selfHosted) {
    return {
      kind: 'self-hosted',
      baseUrl: selfHosted,
      apiKey: process.env.WHISPER_API_KEY,
      model: process.env.WHISPER_MODEL || 'Systran/faster-whisper-small',
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      kind: 'openai',
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_WHISPER_MODEL,
    };
  }
  return { kind: 'none' };
}

const DOWNLOAD_TIMEOUT_MS = 60_000;
const TRANSCRIBE_TIMEOUT_MS = 300_000;
// OpenAI Whisper API hard limit = 25 MB. Self-hosted мог тянуть больше,
// но для IG Reels (обычно < 10 MB) общий потолок 25 MB безопасен.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type TranscribeResult =
  | { ok: true; text: string; lang: string; source: 'whisper' | 'caption' }
  | { ok: false; error: string };

/**
 * Скачать аудио ролика и прогнать через выбранный Whisper-backend.
 * Если ни whisper-сервис, ни OpenAI-ключ не настроены — возвращает
 * caption как fallback с source='caption'.
 */
export async function transcribeReel(opts: {
  videoUrl: string | null;
  caption: string | null;
  lang?: string;
}): Promise<TranscribeResult> {
  const backend = pickBackend();

  if (backend.kind !== 'none' && opts.videoUrl) {
    try {
      const baseUrl = backend.kind === 'openai' ? OPENAI_WHISPER_URL : backend.baseUrl;
      const result = await transcribeViaWhisper({
        baseUrl,
        apiKey: backend.apiKey,
        model: backend.model,
        videoUrl: opts.videoUrl,
        lang: opts.lang,
      });
      if (result.ok && result.text.length > 20) {
        return {
          ok: true,
          text: result.text,
          lang: result.lang || opts.lang || 'ru',
          source: 'whisper',
        };
      }
      if (!result.ok) {
        console.warn(`[transcribe] ${backend.kind} failed: ${result.error}`);
      }
    } catch (e) {
      console.warn(`[transcribe] ${backend.kind} threw: ${(e as Error).message}`);
      // fall through to caption fallback
    }
  }

  // Fallback на caption — он часто содержит сам сценарий рилса
  if (opts.caption && opts.caption.trim().length > 20) {
    return {
      ok: true,
      text: opts.caption.trim(),
      lang: opts.lang || 'ru',
      source: 'caption',
    };
  }

  return { ok: false, error: 'no_transcript_source' };
}

/**
 * Улучшенная версия транскрипта (ТЗ §6.1 «улучшенная» версия): Claude
 * чистит филлеры, разбивает на абзацы, расставляет пунктуацию. Для
 * caption-fallback'а просто приводит в порядок текст.
 *
 * Если ANTHROPIC_API_KEY отсутствует — возвращает оригинал as-is.
 */
export async function improveTranscript(raw: string, lang = 'ru'): Promise<{
  ok: true;
  text: string;
  improved: boolean;
}> {
  if (!env.ANTHROPIC_API_KEY || raw.length < 50) {
    return { ok: true, text: raw, improved: false };
  }
  const system = `Ты — редактор расшифровок. Тебе дают сырую транскрипцию короткого вертикального видео (Reels) на ${
    lang === 'ru' ? 'русском' : lang
  } языке. Твоя задача — почистить её для удобного чтения:

- убери филлеры ("эээ", "ну", "значит", "вот"), повторы слов
- расставь пунктуацию и заглавные буквы
- разбей на 2-4 абзаца по смыслу
- сохрани ВСЕ ключевые фразы и смысл оригинала — ничего не пересказывай и не додумывай

Верни ТОЛЬКО очищенный текст. Без markdown, без преамбулы, без пояснений.`;

  const res = await claudeChat({
    system,
    user: raw.slice(0, 8000),
    maxTokens: 2000,
    timeoutMs: 60_000,
    // Используем Haiku — задача редакторская, не требует Sonnet
    model: env.ANTHROPIC_PARSER_MODEL,
  });
  if (!res.ok) return { ok: true, text: raw, improved: false };

  const cleaned = res.text
    .replace(/^```\w*\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  if (cleaned.length < 30) return { ok: true, text: raw, improved: false };
  return { ok: true, text: cleaned, improved: true };
}

/**
 * Скачать видео по URL и отправить в whisper-сервис как multipart-form
 * на OpenAI-совместимый endpoint /v1/audio/transcriptions.
 *
 * Возвращаем сырой текст — improveTranscript отдельным шагом причешет
 * через Claude.
 */
async function transcribeViaWhisper(opts: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  videoUrl: string;
  lang?: string;
}): Promise<{ ok: true; text: string; lang: string | null } | { ok: false; error: string }> {
  // 1. Скачиваем видео. IG CDN иногда даёт 403 серверу без referer —
  // добавляем общий заголовок, иногда помогает.
  let videoBuffer: ArrayBuffer;
  try {
    const dl = await fetch(opts.videoUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Referer: 'https://www.instagram.com/',
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!dl.ok) return { ok: false, error: `download ${dl.status}` };
    const cl = dl.headers.get('content-length');
    if (cl && parseInt(cl, 10) > MAX_AUDIO_BYTES) {
      return { ok: false, error: `video too large: ${cl} bytes` };
    }
    videoBuffer = await dl.arrayBuffer();
    if (videoBuffer.byteLength > MAX_AUDIO_BYTES) {
      return { ok: false, error: `video too large: ${videoBuffer.byteLength} bytes` };
    }
  } catch (e) {
    return { ok: false, error: `download error: ${(e as Error).message}` };
  }

  // 2. multipart upload в /v1/audio/transcriptions
  const form = new FormData();
  // OpenAI-compat API ожидает поле 'file'
  form.append('file', new Blob([videoBuffer], { type: 'video/mp4' }), 'reel.mp4');
  form.append('model', opts.model);
  if (opts.lang) form.append('language', opts.lang);
  form.append('response_format', 'json');

  let res: Response;
  try {
    res = await fetch(
      `${opts.baseUrl.replace(/\/$/, '')}/v1/audio/transcriptions`,
      {
        method: 'POST',
        headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      },
    );
  } catch (e) {
    return { ok: false, error: `whisper unreachable: ${(e as Error).message}` };
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return { ok: false, error: `whisper ${res.status}: ${txt.slice(0, 200)}` };
  }
  const data = (await res.json().catch(() => null)) as { text?: string; language?: string } | null;
  if (!data?.text) return { ok: false, error: 'whisper_empty_response' };
  return { ok: true, text: data.text, lang: data.language ?? null };
}
