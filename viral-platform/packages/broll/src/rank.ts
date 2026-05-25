import { BROLL, CACHE_TTL, type RankedAsset, type StockAsset, cosineSimilarity } from '@vp/shared';
import type { BrollEngineDeps } from './deps.js';

/** Text we embed for an asset: its description plus tags (§4.2 step 4). */
function assetText(a: StockAsset): string {
  return [a.description, ...a.tags].filter(Boolean).join(', ');
}

/**
 * Cache-aware embedding of assets, keyed per asset (§4.4: 30-day TTL). Returns
 * a map from asset id to its vector, embedding only cache-misses in one batch.
 */
export async function embedAssets(
  assets: StockAsset[],
  deps: BrollEngineDeps,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const misses: StockAsset[] = [];

  for (const a of assets) {
    const key = `embed:asset:${a.provider}:${a.providerAssetId}`;
    const hit = deps.cache ? await deps.cache.get(key) : null;
    if (hit) out.set(a.id, JSON.parse(hit) as number[]);
    else misses.push(a);
  }

  if (misses.length > 0) {
    const vectors = await deps.embed(misses.map(assetText));
    for (let i = 0; i < misses.length; i++) {
      const a = misses[i] as StockAsset;
      const v = vectors[i];
      if (!v) continue;
      out.set(a.id, v);
      if (deps.cache) {
        await deps.cache.set(
          `embed:asset:${a.provider}:${a.providerAssetId}`,
          JSON.stringify(v),
          CACHE_TTL.assetEmbedding,
        );
      }
    }
  }
  return out;
}

/** Cache-aware embedding of a query concept (§4.4: 7-day TTL). */
export async function embedQuery(concept: string, deps: BrollEngineDeps): Promise<number[]> {
  const key = `embed:query:${concept.toLowerCase().trim()}`;
  if (deps.cache) {
    const hit = await deps.cache.get(key);
    if (hit) return JSON.parse(hit) as number[];
  }
  const [v] = await deps.embed([concept]);
  if (!v) throw new Error('empty query embedding');
  if (deps.cache) await deps.cache.set(key, JSON.stringify(v), CACHE_TTL.queryEmbedding);
  return v;
}

/**
 * Pure ranking: cosine-similarity of each asset to the query, sorted
 * descending, truncated to the shortlist size (§4.2 step 4). Assets without an
 * embedding are dropped.
 */
export function rankAssets(
  queryEmbedding: number[],
  assets: StockAsset[],
  assetEmbeddings: Map<string, number[]>,
  topN: number = BROLL.topRanked,
  /** Optional per-asset score bonus (hybrid adds +0.15 to library, §4.5). It
   *  affects ordering only; `similarity` stays the raw cosine. */
  scoreBonus?: (asset: StockAsset) => number,
): RankedAsset[] {
  return assets
    .map((asset) => {
      const v = assetEmbeddings.get(asset.id);
      if (!v) return null;
      const similarity = cosineSimilarity(queryEmbedding, v);
      return { asset, similarity, score: similarity + (scoreBonus?.(asset) ?? 0) };
    })
    .filter((r): r is RankedAsset & { score: number } => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ asset, similarity }) => ({ asset, similarity }));
}

/**
 * Diversity filter (§4.2 step 4): pick the best-ranked asset that isn't too
 * similar to anything already used in this clip (e.g. avoid two ocean shots in
 * a row). Returns the chosen asset, or undefined if the shortlist is empty.
 */
export function pickWithDiversity(
  ranked: RankedAsset[],
  assetEmbeddings: Map<string, number[]>,
  usedEmbeddings: number[][],
  ceiling: number = BROLL.diversitySimilarityCeiling,
): RankedAsset | undefined {
  if (ranked.length === 0) return undefined;

  for (const candidate of ranked) {
    const v = assetEmbeddings.get(candidate.asset.id);
    if (!v) continue;
    const tooSimilar = usedEmbeddings.some((u) => cosineSimilarity(v, u) > ceiling);
    if (!tooSimilar) return candidate;
  }
  // Everything clashes with prior picks — fall back to the top match.
  return ranked[0];
}
