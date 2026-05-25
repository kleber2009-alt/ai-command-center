import { BROLL, CACHE_TTL, type StockAsset } from '@vp/shared';
import type { BrollEngineDeps } from './deps.js';

function sha256ish(s: string): string {
  // Tiny stable hash for cache keys (FNV-1a). Not cryptographic.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

async function cachedSearch(
  provider: 'pexels' | 'pixabay',
  query: string,
  fn: (q: string) => Promise<StockAsset[]>,
  deps: BrollEngineDeps,
): Promise<StockAsset[]> {
  const key = `search:${provider}:${sha256ish(query)}`;
  if (deps.cache) {
    const hit = await deps.cache.get(key);
    if (hit) return JSON.parse(hit) as StockAsset[];
  }
  let results: StockAsset[] = [];
  try {
    results = await fn(query);
  } catch (err) {
    deps.logger?.(`stock search failed: ${provider}`, { query, err: String(err) });
    return [];
  }
  if (deps.cache) await deps.cache.set(key, JSON.stringify(results), CACHE_TTL.pexelsSearch);
  return results;
}

/**
 * Step 3 (§4.2): search both providers in parallel for one visual concept,
 * take the top N per source, and keep only assets long enough to cover the
 * insert plus a safety margin.
 */
export async function searchAssets(
  query: string,
  insertDurationMs: number,
  deps: BrollEngineDeps,
): Promise<StockAsset[]> {
  const [pexels, pixabay] = await Promise.all([
    cachedSearch('pexels', query, deps.searchPexels, deps),
    cachedSearch('pixabay', query, deps.searchPixabay, deps),
  ]);

  const minLen = insertDurationMs + BROLL.assetMarginMs;
  const all = [...pexels.slice(0, BROLL.topPerProvider), ...pixabay.slice(0, BROLL.topPerProvider)];
  return all.filter((a) => a.durationMs >= minLen);
}
