import { and, cosineDistance, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from './client.js';
import { assetUsageLog, collections, userAssets } from './schema.js';

export interface LibrarySearchResult {
  id: string;
  provider: 'user_library';
  providerAssetId: string;
  url: string; // r2 key; the caller signs it
  thumbnailUrl: string; // thumbnail r2 key; the caller signs it
  durationMs: number;
  width: number;
  height: number;
  tags: string[];
  description: string;
  embedding: number[];
  similarity: number;
}

/**
 * pgvector similarity search over a user's ready library assets (§4.4.4).
 * Returns assets ordered by cosine similarity, with the raw embedding attached
 * so the B-roll engine can run its unified ranking + diversity pass.
 */
export async function searchLibraryAssets(
  userId: string,
  queryEmbedding: number[],
  opts: { collectionId?: string; minDurationMs?: number; limit?: number } = {},
): Promise<LibrarySearchResult[]> {
  const similarity = sql<number>`1 - (${cosineDistance(userAssets.embedding, queryEmbedding)})`;
  const where = and(
    eq(userAssets.userId, userId),
    eq(userAssets.status, 'ready'),
    isNull(userAssets.deletedAt),
    opts.collectionId ? eq(userAssets.collectionId, opts.collectionId) : undefined,
    opts.minDurationMs ? gte(userAssets.durationMs, opts.minDurationMs) : undefined,
  );

  const rows = await db
    .select({
      id: userAssets.id,
      r2Key: userAssets.r2Key,
      thumbnailR2Key: userAssets.thumbnailR2Key,
      durationMs: userAssets.durationMs,
      width: userAssets.width,
      height: userAssets.height,
      userTags: userAssets.userTags,
      aiMetadata: userAssets.aiMetadata,
      embedding: userAssets.embedding,
      similarity,
    })
    .from(userAssets)
    .where(where)
    .orderBy(desc(similarity))
    .limit(opts.limit ?? 20);

  return rows.map((r) => {
    const meta = (r.aiMetadata ?? {}) as { description?: string; tags?: string[] };
    return {
      id: r.id,
      provider: 'user_library' as const,
      providerAssetId: r.id,
      url: r.r2Key,
      thumbnailUrl: r.thumbnailR2Key ?? r.r2Key,
      durationMs: r.durationMs,
      width: r.width,
      height: r.height,
      tags: [...(meta.tags ?? []), ...(r.userTags ?? [])],
      description: meta.description ?? '',
      embedding: r.embedding ?? [],
      similarity: Number(r.similarity),
    };
  });
}

/** Return the user's default collection, creating it on first use (§4.4.2). */
export async function ensureDefaultCollection(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.userId, userId), eq(collections.isDefault, true)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(collections)
    .values({ userId, name: 'library', isDefault: true })
    .returning({ id: collections.id });
  if (!created) throw new Error('failed to create default collection');
  return created.id;
}

export async function recordAssetUsage(assetId: string, projectId: string): Promise<void> {
  await db.insert(assetUsageLog).values({ assetId, projectId });
}
