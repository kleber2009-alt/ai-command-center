// Перевод произвольного текста (транскрипт, caption) через Claude.
// ТЗ §6.1: кнопка «Перевести (1 кр.)» рядом с транскриптом.
//
// На вход: исходный текст + target lang (BCP-47, дефолт 'ru'). Возвращаем
// чистый перевод без пояснений. Используется и для транскрипта, и для
// caption — caller сам решает что переводить.

import { env } from '@/lib/env';
import { claudeChat } from './claude';

const MAX_INPUT_CHARS = 12_000;

export type TranslateResult =
  | { ok: true; translated: string; targetLang: string }
  | { ok: false; error: string; status?: number };

function languageLabel(code: string): string {
  const map: Record<string, string> = {
    ru: 'русский',
    en: 'английский',
    es: 'испанский',
    pt: 'португальский',
    de: 'немецкий',
    fr: 'французский',
    it: 'итальянский',
    pl: 'польский',
    tr: 'турецкий',
    uk: 'украинский',
    zh: 'китайский',
    ja: 'японский',
    ar: 'арабский',
  };
  return map[code.toLowerCase().slice(0, 2)] || code;
}

export async function translateText(opts: {
  text: string;
  targetLang?: string;
  /** Опционально — подсказать модели исходный язык, если уверены. */
  sourceLang?: string;
}): Promise<TranslateResult> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'no_api_key' };
  const text = (opts.text || '').trim();
  if (!text) return { ok: false, error: 'empty_text' };
  const targetLang = (opts.targetLang || 'ru').toLowerCase().slice(0, 5);

  const truncated = text.length > MAX_INPUT_CHARS;
  const input = truncated ? text.slice(0, MAX_INPUT_CHARS) + '\n[…усечено]' : text;

  const targetLabel = languageLabel(targetLang);
  const system = `Ты — переводчик. Переводи на ${targetLabel} язык БЕЗ пояснений, комментариев, преамбулы.

Правила:
- Сохраняй разбиение на абзацы и тон оригинала.
- Если в тексте уже целевой язык — верни его как есть.
- Не транслитерируй имена брендов / @упоминания / хэштеги.
- Не оборачивай ответ в кавычки или markdown.
- Никаких "Вот перевод:" / "Перевод:" в начале.`;

  const userMsg = opts.sourceLang
    ? `Исходный язык: ${languageLabel(opts.sourceLang)}.\n\n${input}`
    : input;

  const res = await claudeChat({
    system,
    user: userMsg,
    maxTokens: Math.min(4000, Math.max(800, Math.floor(text.length * 1.5))),
    timeoutMs: 60_000,
    model: env.ANTHROPIC_PARSER_MODEL, // дёшево
  });
  if (!res.ok) return { ok: false, error: res.details, status: res.status };

  const cleaned = res.text
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/^(?:вот\s+перевод|перевод|here(?:'s)?\s+the\s+translation)\s*[:.]\s*/i, '')
    .trim();
  if (cleaned.length < 1) return { ok: false, error: 'empty_response' };

  return { ok: true, translated: cleaned, targetLang };
}
