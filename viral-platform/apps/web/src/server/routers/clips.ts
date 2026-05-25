import { TRPCError } from '@trpc/server';
import { brollPlans, clips, db, projects } from '@vp/db';
import { QUEUE, enqueue } from '@vp/queue';
import type { BRollInsert } from '@vp/shared';
import { presignDownload } from '@vp/storage';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';

/** Library inserts store R2 keys; sign them so the editor can display them. */
async function signLibraryInserts(inserts: BRollInsert[]): Promise<BRollInsert[]> {
  return Promise.all(
    inserts.map(async (ins) =>
      ins.fromUserLibrary
        ? {
            ...ins,
            assetUrl: await presignDownload(ins.assetUrl, 'library'),
            thumbnailUrl: await presignDownload(ins.thumbnailUrl, 'library'),
          }
        : ins,
    ),
  );
}

/** Throw unless the clip belongs to a project owned by the caller. */
async function ownedClip(userId: string, clipId: string) {
  const [row] = await db
    .select({ clip: clips, projectUser: projects.userId })
    .from(clips)
    .innerJoin(projects, eq(clips.projectId, projects.id))
    .where(eq(clips.id, clipId))
    .limit(1);
  if (!row || row.projectUser !== userId) throw new TRPCError({ code: 'NOT_FOUND' });
  return row.clip;
}

export const clipsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)))
        .limit(1);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return db
        .select()
        .from(clips)
        .where(eq(clips.projectId, input.projectId))
        .orderBy(desc(clips.viralScore));
    }),

  get: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ownedClip(ctx.userId, input.clipId);
      const [plan] = await db
        .select()
        .from(brollPlans)
        .where(eq(brollPlans.clipId, clip.id))
        .orderBy(desc(brollPlans.version))
        .limit(1);
      if (!plan) return { clip, brollPlan: null };
      const inserts = await signLibraryInserts(plan.inserts as BRollInsert[]);
      return { clip, brollPlan: { ...plan, inserts } };
    }),

  // Re-run the B-roll engine for a clip (broll.regenerateBroll wired here, §7).
  regenerateBroll: protectedProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const clip = await ownedClip(ctx.userId, input.clipId);
      await db.update(clips).set({ status: 'planning' }).where(eq(clips.id, clip.id));
      await enqueue(QUEUE.broll, {
        projectId: clip.projectId,
        userId: ctx.userId,
        clipId: clip.id,
      });
      return { ok: true };
    }),
});
