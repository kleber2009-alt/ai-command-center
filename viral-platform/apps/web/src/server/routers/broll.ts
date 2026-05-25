import { TRPCError } from '@trpc/server';
import { embedOne, searchPexels, searchPixabay } from '@vp/ai';
import { brollPlans, clips, db, projects, searchLibraryAssets } from '@vp/db';
import {
  BROLL,
  type BRollInsert,
  brollReplaceInput,
  brollSearchInput,
  brollSearchLibraryInput,
} from '@vp/shared';
import { presignDownload } from '@vp/storage';
import { desc, eq } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc.js';

async function assertOwnsClip(userId: string, clipId: string): Promise<void> {
  const [row] = await db
    .select({ user: projects.userId })
    .from(clips)
    .innerJoin(projects, eq(clips.projectId, projects.id))
    .where(eq(clips.id, clipId))
    .limit(1);
  if (!row || row.user !== userId) throw new TRPCError({ code: 'NOT_FOUND' });
}

export const brollRouter = router({
  // Manual STOCK search for the editor's "From stock" tab (§8.2).
  searchStock: protectedProcedure.input(brollSearchInput).query(async ({ input }) => {
    const minLen = input.durationMs + BROLL.assetMarginMs;
    const [pexels, pixabay] = await Promise.all([
      searchPexels(input.query).catch(() => []),
      searchPixabay(input.query).catch(() => []),
    ]);
    return [...pexels, ...pixabay].filter((a) => a.durationMs >= minLen);
  }),

  // Semantic LIBRARY search for the editor's "From my library" tab (§8.2).
  searchLibrary: protectedProcedure.input(brollSearchLibraryInput).query(async ({ ctx, input }) => {
    const queryEmbedding = await embedOne(input.query);
    const results = await searchLibraryAssets(ctx.userId, queryEmbedding, {
      collectionId: input.collectionId,
      minDurationMs: input.durationMs ? input.durationMs + BROLL.assetMarginMs : undefined,
      limit: 24,
    });
    // url/thumbnailUrl are R2 keys; sign them for the browser.
    return Promise.all(
      results.map(async (r) => ({
        ...r,
        url: await presignDownload(r.url, 'library'),
        thumbnailUrl: await presignDownload(r.thumbnailUrl, 'library'),
      })),
    );
  }),

  // Replace a single insert's asset in the latest plan (broll.replaceInsert, §7).
  replaceInsert: protectedProcedure.input(brollReplaceInput).mutation(async ({ ctx, input }) => {
    await assertOwnsClip(ctx.userId, input.clipId);

    const [plan] = await db
      .select()
      .from(brollPlans)
      .where(eq(brollPlans.clipId, input.clipId))
      .orderBy(desc(brollPlans.version))
      .limit(1);
    if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'No B-roll plan' });

    const inserts = plan.inserts as BRollInsert[];
    const target = inserts[input.insertIndex];
    if (!target) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insert index out of range' });

    const updated: BRollInsert[] = inserts.map((ins, i) =>
      i === input.insertIndex
        ? {
            ...ins,
            source: input.asset.provider,
            assetId: input.asset.id,
            assetUrl: input.asset.url,
            thumbnailUrl: input.asset.thumbnailUrl,
            confidence: 1, // a manual pick is authoritative
            reason: 'manually selected',
          }
        : ins,
    );

    // New version so edits are non-destructive and diffable.
    await db
      .insert(brollPlans)
      .values({ clipId: input.clipId, version: plan.version + 1, inserts: updated });
    return { version: plan.version + 1, inserts: updated };
  }),
});
