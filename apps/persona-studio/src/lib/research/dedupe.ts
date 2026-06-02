// Дедуп для Этапа 1 — без pgvector (отдельный шаг с расширением и
// эмбеддингами). Текущая стратегия:
//   1. По (platform, externalId) — обеспечивается уникальным индексом
//      в схеме, дублей в БД не будет физически.
//   2. По нормализованному captionHash — отсекаем 10 копий одного
//      тренда от разных авторов с одинаковым текстом (рекруты, REPOSTы).
//
// pgvector-семантический дедуп (caption_embedding) — следующая итерация.

import { createHash } from 'node:crypto';

const CAPTION_TRUNCATE = 280;

/**
 * Нормализуем caption перед хешем: убираем emoji-варианты, схлопываем
 * пробелы, нижний регистр, обрезаем длину. SHA-1 достаточен — нам важна
 * только коллизия, не криптостойкость.
 */
export function captionHash(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const normalized = caption
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CAPTION_TRUNCATE);
  if (normalized.length < 16) return null; // слишком короткий caption — не доверяем
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Из массива рилсов выкидываем тех, у кого captionHash уже встречался.
 * Первый встреченный остаётся. Если у обоих null — оставляем обоих
 * (нет данных для дедупа).
 */
export function dedupeByCaption<T extends { captionHash: string | null }>(reels: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of reels) {
    if (!r.captionHash) {
      out.push(r);
      continue;
    }
    if (seen.has(r.captionHash)) continue;
    seen.add(r.captionHash);
    out.push(r);
  }
  return out;
}
