import { BROLL, type BrollMode, type StockAsset } from '@vp/shared';
import type { BrollEngineDeps } from './deps.js';
import { embedAssets } from './rank.js';
import { searchAssets } from './search.js';

export interface SourcingInput {
  mode: BrollMode;
  visualConcept: string;
  durationMs: number;
  queryEmbedding: number[];
  collectionId?: string;
  deps: BrollEngineDeps;
}

export interface Sourced {
  assets: StockAsset[];
  embeddings: Map<string, number[]>;
  /** my_library: no asset cleared the similarity bar — flag the insert (§4.4.4). */
  lowConfidence: boolean;
  /** Hybrid score bonus applied during ranking (§4.5). */
  scoreBonus?: (asset: StockAsset) => number;
}

/**
 * Step 3 of the engine, mode-aware (§4.3 / §4.4 / §4.5). Gathers the candidate
 * pool and per-asset embeddings for one B-roll opportunity:
 *   - auto_stock: Pexels + Pixabay only
 *   - my_library: pgvector search over the user's library only
 *   - hybrid: library first; if <3 confident hits, add stock with a bonus
 */
export async function gatherCandidates(input: SourcingInput): Promise<Sourced> {
  const { mode, visualConcept, durationMs, queryEmbedding, collectionId, deps } = input;
  const minDurationMs = durationMs + BROLL.assetMarginMs;

  if (mode === 'auto_stock') {
    const assets = await searchAssets(visualConcept, durationMs, deps);
    return { assets, embeddings: await embedAssets(assets, deps), lowConfidence: false };
  }

  const library = deps.searchLibrary
    ? await deps.searchLibrary(queryEmbedding, {
        collectionId,
        minDurationMs,
        limit: BROLL.libraryCandidateLimit,
      })
    : [];
  const libEmbeddings = new Map(library.map((a) => [a.id, a.embedding]));

  if (mode === 'my_library') {
    const goodEnough = library.filter((a) => a.similarity > BROLL.libraryMinSimilarity).length;
    return {
      assets: library,
      embeddings: libEmbeddings,
      lowConfidence: goodEnough < BROLL.libraryConfidentMin,
    };
  }

  // hybrid (§4.5)
  const confident = library.filter((a) => a.similarity > BROLL.hybridConfidentSimilarity);
  const scoreBonus = (a: StockAsset) =>
    a.provider === 'user_library' ? BROLL.hybridLibraryBonus : 0;

  if (confident.length >= BROLL.hybridConfidentMin) {
    return { assets: library, embeddings: libEmbeddings, lowConfidence: false, scoreBonus };
  }

  const stock = await searchAssets(visualConcept, durationMs, deps);
  const stockEmbeddings = await embedAssets(stock, deps);
  const embeddings = new Map([...libEmbeddings, ...stockEmbeddings]);
  return { assets: [...library, ...stock], embeddings, lowConfidence: false, scoreBonus };
}
