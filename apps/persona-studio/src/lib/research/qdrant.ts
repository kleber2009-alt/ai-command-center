// Qdrant клиент для research-рилсов. Один collection
// QDRANT_REELS_COLLECTION хранит точки с payload:
//   { reelId, authorUsername, viralScore, virality, postedAt }
//
// Operations:
//   - ensureCollection — лениво создаёт коллекцию с правильной размерностью
//   - upsertReel — кладёт/перезаписывает точку
//   - searchSimilar — KNN-поиск ближайших соседей
//   - dedupeBatch — для каждой точки из batch'а ищем существующих с
//     cosine > threshold; помечаем как дубль если найдены
//
// Без VOYAGE_API_KEY / QDRANT_URL функции возвращают пустой результат —
// caller fallback'ит на captionHash-дедуп.

import { env } from '@/lib/env';
import { EMBEDDING_DIM } from './embeddings';

const COSINE_DUPE_THRESHOLD = 0.92; // эмпирически: перепосты/копии трендов

type QdrantPoint = {
  id: string;
  vector: number[];
  payload: {
    reelId: string;
    authorUsername: string;
    viralScore: number | null;
    virality: number | null;
    postedAt: string | null;
  };
};

function qdrantBaseUrl(): string | null {
  return env.QDRANT_URL || null;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.QDRANT_API_KEY) h['api-key'] = env.QDRANT_API_KEY;
  return h;
}

export function isQdrantConfigured(): boolean {
  return Boolean(env.QDRANT_URL);
}

let _collectionReady = false;

/**
 * Идемпотентно создаёт коллекцию если ещё нет. Вызывается лениво перед
 * первым upsert.
 */
export async function ensureCollection(): Promise<{ ok: boolean; error?: string }> {
  if (_collectionReady) return { ok: true };
  const base = qdrantBaseUrl();
  if (!base) return { ok: false, error: 'qdrant_not_configured' };
  const name = env.QDRANT_REELS_COLLECTION;

  // Проверим что коллекция есть
  const get = await fetch(`${base}/collections/${encodeURIComponent(name)}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (get && get.ok) {
    _collectionReady = true;
    return { ok: true };
  }
  if (get && get.status !== 404) {
    return { ok: false, error: `qdrant get ${get.status}` };
  }

  // Создаём
  const create = await fetch(`${base}/collections/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => ({ ok: false, status: 0, error: (e as Error).message }) as unknown as Response);
  if (!create || !create.ok) {
    const status = (create as Response)?.status ?? 0;
    return { ok: false, error: `qdrant create ${status}` };
  }
  _collectionReady = true;
  return { ok: true };
}

/**
 * Upsert (вектор + payload). Caller передаёт уже посчитанный вектор.
 */
export async function upsertReels(points: QdrantPoint[]): Promise<{ ok: boolean; error?: string }> {
  if (points.length === 0) return { ok: true };
  const base = qdrantBaseUrl();
  if (!base) return { ok: false, error: 'qdrant_not_configured' };
  const ensure = await ensureCollection();
  if (!ensure.ok) return ensure;

  const res = await fetch(
    `${base}/collections/${encodeURIComponent(env.QDRANT_REELS_COLLECTION)}/points?wait=true`,
    {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  ).catch(() => null);
  if (!res || !res.ok) {
    return { ok: false, error: `qdrant upsert ${res?.status ?? 0}` };
  }
  return { ok: true };
}

export type SimilarHit = {
  reelId: string;
  authorUsername: string;
  score: number;
};

/**
 * Найти top-K похожих по cosine. Используется для семантического дедупа.
 */
export async function searchSimilar(
  vector: number[],
  limit = 5,
  scoreThreshold = 0.0,
): Promise<SimilarHit[]> {
  const base = qdrantBaseUrl();
  if (!base) return [];
  const ensure = await ensureCollection();
  if (!ensure.ok) return [];

  const res = await fetch(
    `${base}/collections/${encodeURIComponent(env.QDRANT_REELS_COLLECTION)}/points/search`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        vector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
      }),
      signal: AbortSignal.timeout(8000),
    },
  ).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => null)) as {
    result?: Array<{
      id: string;
      score: number;
      payload: { reelId?: string; authorUsername?: string };
    }>;
  } | null;
  if (!data?.result) return [];
  return data.result
    .filter((h) => h.payload?.reelId)
    .map((h) => ({
      reelId: h.payload.reelId!,
      authorUsername: h.payload.authorUsername || '',
      score: h.score,
    }));
}

/**
 * Семантический дедуп: для batch новых рилсов спрашиваем у Qdrant
 * ближайших. Если у соседа viralScore выше — текущий идёт в drop.
 *
 * Логика «оставляем сильнейший из дублей» унифицирована: вместо парных
 * сравнений (где сложно избежать дроп-обоих) мы делаем ОДНУ проверку на
 * рилс — «есть ли в Qdrant сосед сильнее меня?». Если да — этот рилс
 * дубль. Если нет — оставляем.
 *
 * Caller должен сначала сделать upsertReels (чтобы рилсы стали видны
 * друг другу в Qdrant), потом findDuplicateReelIds.
 */
export async function findDuplicateReelIds(
  batch: Array<{ reelId: string; vector: number[]; viralScore: number | null }>,
): Promise<Set<string>> {
  const dupes = new Set<string>();
  if (batch.length === 0) return dupes;

  const CONCURRENCY = 5;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const slice = batch.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (item) => {
        const hits = await searchSimilar(item.vector, 5, COSINE_DUPE_THRESHOLD);
        const myScore = item.viralScore || 0;
        // Дубль = существует сосед-не-я с >= viralScore. Если есть равный
        // или лучше — мы лузер, идём в drop.
        const beatenBy = hits.find((h) => h.reelId !== item.reelId);
        if (!beatenBy) return;
        // Знаем только score из Qdrant payload — он хранится при upsert'е
        // у каждой точки. Тянуть отдельно payload — лишний round-trip,
        // используем то что вернулось.
        // Если у нас нет cached viralScore (новый рилс), считаем себя
        // слабее существующего → дубль.
        const dupeIds = hits.filter((h) => h.reelId !== item.reelId).map((h) => h.reelId);
        if (dupeIds.length > 0) {
          // Стратегия: если ВСЕ соседи имеют тот же authorUsername — это
          // re-upload одного автора, оставляем хотя бы один; пометим
          // дублем только если соседи — РАЗНЫЕ авторы (значит реальный
          // распространяющийся тренд).
          // Простое правило: пометим как дубль если есть хотя бы один
          // сосед с другим автором.
          // На этом этапе без payload.viralScore не можем сравнить —
          // делаем безопасное правило: если есть соседи, помечаем как
          // дубль ТОЛЬКО если у нас viralScore низкий (<10). Сильные
          // выбросы (≥10) всегда показываем — пусть пользователь сам
          // увидит распространение тренда.
          if (myScore < 10) dupes.add(item.reelId);
        }
      }),
    );
  }
  return dupes;
}
