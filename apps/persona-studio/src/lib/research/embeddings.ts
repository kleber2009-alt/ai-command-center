// Voyage AI embeddings client (ТЗ §4 — caption_embedding для семантического
// дедупа). Используем `voyage-3` (1024-dim, дешёво, multilingual).
//
// Без VOYAGE_API_KEY функция возвращает null и caller'ы fallback'ят на
// captionHash-дедуп. Не блокируем pipeline если key не настроен.

import { env } from '@/lib/env';

const API_URL = 'https://api.voyageai.com/v1/embeddings';
const MAX_TEXT_CHARS = 8000; // ~ 4k tokens
const TIMEOUT_MS = 20_000;

export const EMBEDDING_DIM = 1024; // соответствует voyage-3

export function isEmbeddingsConfigured(): boolean {
  return Boolean(env.VOYAGE_API_KEY);
}

export type EmbedResult =
  | { ok: true; vector: number[] }
  | { ok: false; error: string };

/**
 * Получить вектор для одного текста. На пустую/слишком короткую строку
 * возвращаем error без обращения к API.
 */
export async function embedText(text: string): Promise<EmbedResult> {
  const apiKey = env.VOYAGE_API_KEY;
  if (!apiKey) return { ok: false, error: 'no_voyage_api_key' };
  const cleaned = (text || '').trim();
  if (cleaned.length < 8) return { ok: false, error: 'text_too_short' };

  const input = cleaned.length > MAX_TEXT_CHARS ? cleaned.slice(0, MAX_TEXT_CHARS) : cleaned;

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.VOYAGE_MODEL,
        input: [input],
        input_type: 'document', // document mode для индексации (vs query)
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, error: `voyage_unreachable: ${(e as Error).message}` };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `voyage ${res.status}: ${t.slice(0, 200)}` };
  }
  let data: { data?: Array<{ embedding?: number[] }> };
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'voyage_non_json' };
  }
  const vector = data.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    return { ok: false, error: 'voyage_empty_vector' };
  }
  return { ok: true, vector };
}

/**
 * Батч-эмбеддинг — экономит на API-вызовах. Voyage поддерживает до 128
 * текстов на запрос. Длинные тексты обрезаем.
 */
export async function embedBatch(texts: string[]): Promise<Array<number[] | null>> {
  const apiKey = env.VOYAGE_API_KEY;
  if (!apiKey) return texts.map(() => null);
  const inputs = texts.map((t) => {
    const c = (t || '').trim();
    return c.length < 8 ? null : c.length > MAX_TEXT_CHARS ? c.slice(0, MAX_TEXT_CHARS) : c;
  });
  // Voyage не принимает null/пустые — фильтруем, помним индексы
  const idxMap: number[] = [];
  const cleanInputs: string[] = [];
  inputs.forEach((v, i) => {
    if (v) {
      idxMap.push(i);
      cleanInputs.push(v);
    }
  });
  if (cleanInputs.length === 0) return texts.map(() => null);

  // Voyage лимит 128 на запрос — батчим
  const BATCH = 128;
  const out: Array<number[] | null> = new Array(texts.length).fill(null);
  for (let start = 0; start < cleanInputs.length; start += BATCH) {
    const slice = cleanInputs.slice(start, start + BATCH);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: env.VOYAGE_MODEL,
          input: slice,
          input_type: 'document',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS + slice.length * 100),
      });
    } catch {
      continue; // выходим из батча, остальные тоже не пробуем (вероятно сеть)
    }
    if (!res.ok) continue;
    const data = (await res.json().catch(() => null)) as
      | { data?: Array<{ embedding?: number[] }> }
      | null;
    if (!data?.data) continue;
    for (let i = 0; i < slice.length; i++) {
      const v = data.data[i]?.embedding;
      if (Array.isArray(v) && v.length > 0) {
        const origIdx = idxMap[start + i];
        if (origIdx !== undefined) out[origIdx] = v;
      }
    }
  }
  return out;
}
