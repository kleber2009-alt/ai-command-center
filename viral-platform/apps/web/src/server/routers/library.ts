import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { embedOne } from '@vp/ai';
import {
  collections,
  db,
  debitCredits,
  ensureDefaultCollection,
  searchLibraryAssets,
  userAssets,
  users,
} from '@vp/db';
import { QUEUE, enqueue } from '@vp/queue';
import {
  CREDIT_COSTS,
  PLANS,
  assetIdInput,
  collectionIdInput,
  createCollectionInput,
  libraryUploadCompleteInput,
  libraryUploadInitInput,
  listAssetsInput,
  moveAssetInput,
  renameCollectionInput,
  updateAssetTagsInput,
} from '@vp/shared';
import { presignDownload, presignUpload } from '@vp/storage';
import { and, count, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc.js';

function assetType(contentType: string): 'video' | 'image' {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'image';
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only video or image assets are allowed' });
}

/** Enforce per-plan library limits before accepting a new upload (§4.4.1, §10). */
async function assertWithinLimits(userId: string, addBytes: number): Promise<void> {
  const [user] = await db
    .select({ plan: users.plan, used: users.libraryStorageUsedBytes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
  const plan = PLANS[user.plan];

  const [live] = await db
    .select({ n: count() })
    .from(userAssets)
    .where(and(eq(userAssets.userId, userId), isNull(userAssets.deletedAt)));
  if ((live?.n ?? 0) >= plan.libraryAssets) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Library asset limit reached for your plan',
    });
  }
  if (user.used + addBytes > plan.libraryBytes) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Library storage limit reached for your plan',
    });
  }
}

async function ownAsset(userId: string, assetId: string) {
  const [asset] = await db
    .select()
    .from(userAssets)
    .where(and(eq(userAssets.id, assetId), eq(userAssets.userId, userId)))
    .limit(1);
  if (!asset) throw new TRPCError({ code: 'NOT_FOUND' });
  return asset;
}

export const libraryRouter = router({
  // --- collections ---
  createCollection: protectedProcedure
    .input(createCollectionInput)
    .mutation(async ({ ctx, input }) => {
      const [c] = await db
        .insert(collections)
        .values({ userId: ctx.userId, name: input.name })
        .returning();
      return c;
    }),

  listCollections: protectedProcedure.query(async ({ ctx }) => {
    await ensureDefaultCollection(ctx.userId);
    return db
      .select()
      .from(collections)
      .where(eq(collections.userId, ctx.userId))
      .orderBy(desc(collections.isDefault));
  }),

  renameCollection: protectedProcedure
    .input(renameCollectionInput)
    .mutation(async ({ ctx, input }) => {
      await db
        .update(collections)
        .set({ name: input.name })
        .where(and(eq(collections.id, input.collectionId), eq(collections.userId, ctx.userId)));
      return { ok: true };
    }),

  deleteCollection: protectedProcedure.input(collectionIdInput).mutation(async ({ ctx, input }) => {
    const [c] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.id, input.collectionId), eq(collections.userId, ctx.userId)))
      .limit(1);
    if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
    if (c.isDefault)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete the default collection' });
    await db.delete(collections).where(eq(collections.id, input.collectionId));
    return { ok: true };
  }),

  // --- upload (§4.4.7) ---
  uploadInit: protectedProcedure.input(libraryUploadInitInput).mutation(async ({ ctx, input }) => {
    assetType(input.contentType); // validate kind
    await assertWithinLimits(ctx.userId, input.sizeBytes);
    const collectionId = input.collectionId ?? (await ensureDefaultCollection(ctx.userId));
    const ext = input.filename.split('.').pop()?.toLowerCase() ?? 'bin';
    const key = `${ctx.userId}/${collectionId}/${randomUUID()}.${ext}`;
    const url = await presignUpload(key, input.contentType, 'library');
    return { url, key, collectionId };
  }),

  uploadComplete: protectedProcedure
    .input(libraryUploadCompleteInput)
    .mutation(async ({ ctx, input }) => {
      await assertWithinLimits(ctx.userId, input.sizeBytes);
      const collectionId = input.collectionId ?? (await ensureDefaultCollection(ctx.userId));

      const [asset] = await db
        .insert(userAssets)
        .values({
          userId: ctx.userId,
          collectionId,
          type: assetType(input.contentType),
          r2Key: input.r2Key,
          sizeBytes: input.sizeBytes,
          fileHash: input.fileHash,
          status: 'processing',
        })
        .onConflictDoNothing() // dedup by (userId, fileHash) where not deleted
        .returning();
      if (!asset)
        throw new TRPCError({ code: 'CONFLICT', message: 'This file is already in your library' });

      // Charge indexing up front; refunded by the worker on failure (§9).
      try {
        await debitCredits(ctx.userId, CREDIT_COSTS.indexAssetCredits, `index:${asset.id}`);
      } catch {
        await db.delete(userAssets).where(eq(userAssets.id, asset.id));
        throw new TRPCError({ code: 'PAYMENT_REQUIRED', message: 'Not enough credits' });
      }
      await db
        .update(users)
        .set({
          libraryStorageUsedBytes: sql`${users.libraryStorageUsedBytes} + ${input.sizeBytes}`,
        })
        .where(eq(users.id, ctx.userId));

      await enqueue(
        QUEUE.indexAsset,
        { userId: ctx.userId, assetId: asset.id },
        `index:${asset.id}`,
      );
      return { assetId: asset.id };
    }),

  // --- assets ---
  listAssets: protectedProcedure.input(listAssetsInput).query(async ({ ctx, input }) => {
    // Semantic search path uses pgvector; plain listing is paginated by date.
    if (input.search && input.search.trim().length >= 2) {
      const queryEmbedding = await embedOne(input.search);
      const results = await searchLibraryAssets(ctx.userId, queryEmbedding, {
        collectionId: input.collectionId,
        limit: input.limit,
      });
      const items = await Promise.all(
        results.map(async (r) => ({
          id: r.id,
          type: r.durationMs > 0 ? ('video' as const) : ('image' as const),
          thumbnailUrl: await presignDownload(r.thumbnailUrl, 'library'),
          description: r.description,
          tags: r.tags,
          similarity: r.similarity,
        })),
      );
      return { items, nextCursor: undefined as string | undefined };
    }

    const rows = await db
      .select()
      .from(userAssets)
      .where(
        and(
          eq(userAssets.userId, ctx.userId),
          isNull(userAssets.deletedAt),
          input.collectionId ? eq(userAssets.collectionId, input.collectionId) : undefined,
          input.type ? eq(userAssets.type, input.type) : undefined,
          input.cursor ? lt(userAssets.createdAt, new Date(input.cursor)) : undefined,
        ),
      )
      .orderBy(desc(userAssets.createdAt))
      .limit(input.limit + 1);

    let nextCursor: string | undefined;
    if (rows.length > input.limit) nextCursor = rows.pop()?.createdAt.toISOString();

    const items = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        collectionId: r.collectionId,
        durationMs: r.durationMs,
        orientation: r.orientation,
        userTags: r.userTags,
        aiMetadata: r.aiMetadata,
        thumbnailUrl: r.thumbnailR2Key ? await presignDownload(r.thumbnailR2Key, 'library') : null,
      })),
    );
    return { items, nextCursor };
  }),

  getAsset: protectedProcedure.input(assetIdInput).query(async ({ ctx, input }) => {
    const asset = await ownAsset(ctx.userId, input.assetId);
    return {
      ...asset,
      url: await presignDownload(asset.r2Key, 'library'),
      thumbnailUrl: asset.thumbnailR2Key
        ? await presignDownload(asset.thumbnailR2Key, 'library')
        : null,
    };
  }),

  updateAssetTags: protectedProcedure
    .input(updateAssetTagsInput)
    .mutation(async ({ ctx, input }) => {
      await ownAsset(ctx.userId, input.assetId);
      await db
        .update(userAssets)
        .set({ userTags: input.userTags })
        .where(eq(userAssets.id, input.assetId));
      return { ok: true };
    }),

  moveAsset: protectedProcedure.input(moveAssetInput).mutation(async ({ ctx, input }) => {
    await ownAsset(ctx.userId, input.assetId);
    const [target] = await db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.id, input.collectionId), eq(collections.userId, ctx.userId)))
      .limit(1);
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
    await db
      .update(userAssets)
      .set({ collectionId: input.collectionId })
      .where(eq(userAssets.id, input.assetId));
    return { ok: true };
  }),

  // Soft delete; physical removal happens via the R2 lifecycle rule (§4.4.7).
  deleteAsset: protectedProcedure.input(assetIdInput).mutation(async ({ ctx, input }) => {
    const asset = await ownAsset(ctx.userId, input.assetId);
    if (asset.deletedAt) return { ok: true, freedBytes: 0 };
    await db
      .update(userAssets)
      .set({ deletedAt: new Date() })
      .where(eq(userAssets.id, input.assetId));
    await db
      .update(users)
      .set({
        libraryStorageUsedBytes: sql`GREATEST(0, ${users.libraryStorageUsedBytes} - ${asset.sizeBytes})`,
      })
      .where(eq(users.id, ctx.userId));
    return { ok: true, freedBytes: asset.sizeBytes };
  }),

  reindexAsset: protectedProcedure.input(assetIdInput).mutation(async ({ ctx, input }) => {
    const asset = await ownAsset(ctx.userId, input.assetId);
    await debitCredits(ctx.userId, CREDIT_COSTS.indexAssetCredits, `reindex:${asset.id}`);
    await db.update(userAssets).set({ status: 'processing' }).where(eq(userAssets.id, asset.id));
    await enqueue(QUEUE.indexAsset, { userId: ctx.userId, assetId: asset.id });
    return { ok: true };
  }),
});
