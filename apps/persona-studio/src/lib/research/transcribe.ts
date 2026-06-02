// Транскрибация ролика. По ТЗ §6.1 источник — self-hosted faster-whisper
// в Docker на VPS. Этот файл — провайдер-агностичный shim: главная
// функция transcribeReel вызывает выбранный backend (whisper-service URL
// из env, либо fallback на caption если whisper не настроен).
//
// На Этапе 3 deploy faster-whisper делается отдельным шагом — для
// первой итерации UX мы возвращаем caption как «транскрипт-заглушку»
// с пометкой source='caption', чтобы пользователь видел что транскрипция
// нужна для качества анализа, но анализ при этом не блокируется.

import { env } from '@/lib/env';
import { claudeChat } from './claude';

type WhisperEnv = {
  WHISPER_SERVICE_URL?: string;
  WHISPER_API_KEY?: string;
};

// Конфиг через process.env, чтобы не падать на env-zod-валидации если
// сервис не задеплоен. Когда сервис появится — поднимем в schema.
function whisperConfig(): WhisperEnv {
  return {
    WHISPER_SERVICE_URL: process.env.WHISPER_SERVICE_URL,
    WHISPER_API_KEY: process.env.WHISPER_API_KEY,
  };
}

export type TranscribeResult =
  | { ok: true; text: string; lang: string; source: 'whisper' | 'caption' }
  | { ok: false; error: string };

/**
 * Скачать аудио ролика и прогнать через self-hosted faster-whisper.
 * Если сервис не настроен — возвращает caption как fallback с
 * source='caption' (чтобы caller знал, что качество ниже).
 */
export async function transcribeReel(opts: {
  videoUrl: string | null;
  caption: string | null;
  lang?: string;
}): Promise<TranscribeResult> {
  const cfg = whisperConfig();

  if (cfg.WHISPER_SERVICE_URL && opts.videoUrl) {
    try {
      const res = await fetch(`${cfg.WHISPER_SERVICE_URL.replace(/\/$/, '')}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.WHISPER_API_KEY ? { Authorization: `Bearer ${cfg.WHISPER_API_KEY}` } : {}),
        },
        body: JSON.stringify({ url: opts.videoUrl, language: opts.lang }),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string; language?: string };
        if (data.text && data.text.length > 20) {
          return {
            ok: true,
            text: data.text,
            lang: data.language || opts.lang || 'ru',
            source: 'whisper',
          };
        }
      }
    } catch (e) {
      console.warn(`[transcribe] whisper failed: ${(e as Error).message}`);
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
