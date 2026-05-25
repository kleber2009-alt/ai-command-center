import type { StockAsset } from '@vp/shared';

/**
 * Everything the engine needs from the outside world. Injected so the package
 * stays pure and testable without Next.js, the DB, or live APIs (spec §2, §4.5).
 */
export interface BrollEngineDeps {
  /** Single-turn LLM completion (Claude Sonnet) returning raw text. */
  llmComplete(prompt: string): Promise<string>;
  /** Batch text embedding (text-embedding-3-large). Order-preserving. */
  embed(texts: string[]): Promise<number[][]>;
  /** Stock search per provider; engine handles the duration filter. */
  searchPexels(query: string): Promise<StockAsset[]>;
  searchPixabay(query: string): Promise<StockAsset[]>;
  /** Optional cache (Redis in prod) for embeddings and search results (§4.4). */
  cache?: BrollCache;
  logger?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface BrollCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
