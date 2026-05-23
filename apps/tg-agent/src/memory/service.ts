// MemoryService — high-level wrapper over OpenAI embeddings + Qdrant.
//
// Two entry points:
//  • indexMessage(item) — used inline from the bot pipeline.
//    Fire-and-forget; never blocks the reply path.
//  • indexBatch(items)  — used by the backfill script.
//  • search(query, …)   — used by /api/memory/search.
//
// The collection is lazily created on first call to ready(), which the
// bootstrap path calls once on startup. Vector size is discovered by
// embedding a one-character probe, so a model swap that changes the
// dimension automatically picks the right collection shape.

import type { Logger } from '../logger.js';
import type { EmbeddingClient } from './embeddings.js';
import type {
  QdrantClient,
  QdrantFilter,
  QdrantPayload,
  QdrantSearchHit,
} from './qdrant.js';

export interface MemoryItem {
  id: number;
  text: string;
  payload: QdrantPayload;
}

export interface MemorySearchOptions {
  limit?: number;
  chatId?: number;
  minScore?: number;
}

export interface MemoryService {
  ready(): Promise<void>;
  indexMessage(item: MemoryItem): Promise<void>;
  indexBatch(items: MemoryItem[]): Promise<{ indexed: number; failed: number }>;
  search(query: string, options?: MemorySearchOptions): Promise<QdrantSearchHit[]>;
  info(): Promise<{ pointsCount: number; vectorSize: number | null; model: string }>;
  readonly enabled: boolean;
}

export interface MemoryServiceOptions {
  embeddings: EmbeddingClient;
  qdrant: QdrantClient;
  logger: Logger;
  // Batch size for indexBatch. OpenAI accepts up to 2048 inputs per
  // call, but we keep it conservative for memory and to surface
  // failures on smaller chunks.
  batchSize?: number;
}

const DEFAULT_BATCH = 64;

export function createMemoryService(opts: MemoryServiceOptions): MemoryService {
  const { embeddings, qdrant, logger } = opts;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;

  let readyPromise: Promise<void> | null = null;

  async function discoverAndEnsure(): Promise<void> {
    const existing = await qdrant.collectionInfo();
    if (existing && existing.vectorSize != null) {
      logger.info('memory: collection already exists', {
        pointsCount: existing.pointsCount,
        vectorSize: existing.vectorSize,
        model: embeddings.model,
      });
      return;
    }
    const probe = await embeddings.embed('ping');
    await qdrant.ensureCollection(probe.length);
    logger.info('memory: collection created', {
      vectorSize: probe.length,
      model: embeddings.model,
    });
  }

  return {
    enabled: true,

    async ready(): Promise<void> {
      if (!readyPromise) readyPromise = discoverAndEnsure();
      return readyPromise;
    },

    async indexMessage(item: MemoryItem): Promise<void> {
      await this.ready();
      const vector = await embeddings.embed(item.text);
      await qdrant.upsert([{ id: item.id, vector, payload: item.payload }]);
    },

    async indexBatch(items: MemoryItem[]): Promise<{ indexed: number; failed: number }> {
      await this.ready();
      let indexed = 0;
      let failed = 0;
      for (let i = 0; i < items.length; i += batchSize) {
        const slice = items.slice(i, i + batchSize);
        try {
          const vectors = await embeddings.embedBatch(slice.map((s) => s.text));
          const points = slice.map((s, j) => ({
            id: s.id,
            vector: vectors[j]!,
            payload: s.payload,
          }));
          await qdrant.upsert(points);
          indexed += points.length;
          logger.info('memory: batch indexed', {
            from: i,
            to: i + slice.length,
            total: items.length,
          });
        } catch (err) {
          failed += slice.length;
          logger.error('memory: batch failed', {
            from: i,
            count: slice.length,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { indexed, failed };
    },

    async search(query: string, options): Promise<QdrantSearchHit[]> {
      await this.ready();
      const limit = options?.limit ?? 10;
      const vector = await embeddings.embed(query);
      const filter: QdrantFilter | undefined =
        options?.chatId != null
          ? { must: [{ key: 'chat_id', match: { value: options.chatId } }] }
          : undefined;
      const hits = await qdrant.search(vector, limit, filter);
      const minScore = options?.minScore ?? 0;
      return hits.filter((h) => h.score >= minScore);
    },

    async info() {
      const ci = await qdrant.collectionInfo();
      return {
        pointsCount: ci?.pointsCount ?? 0,
        vectorSize: ci?.vectorSize ?? null,
        model: embeddings.model,
      };
    },
  };
}

// A no-op fallback so callers in the bot pipeline don't have to null-check
// on every message. Returned when MEMORY_ENABLED=false or OPENAI_API_KEY
// is missing. All operations succeed silently / return empty results.
export function createNoopMemoryService(logger: Logger, reason: string): MemoryService {
  logger.info('memory: disabled', { reason });
  return {
    enabled: false,
    async ready(): Promise<void> {},
    async indexMessage(): Promise<void> {},
    async indexBatch(): Promise<{ indexed: number; failed: number }> {
      return { indexed: 0, failed: 0 };
    },
    async search(): Promise<QdrantSearchHit[]> {
      return [];
    },
    async info() {
      return { pointsCount: 0, vectorSize: null, model: '(disabled)' };
    },
  };
}
