import { TRPCError } from '@trpc/server';
import { clips, db, debitCredits, projects } from '@vp/db';
import { QUEUE, enqueue } from '@vp/queue';
import {
  CREDIT_COSTS,
  MAX_CONCURRENT_PROJECTS_PER_USER,
  createProjectInput,
  listProjectsInput,
  setBrollModeInput,
} from '@vp/shared';
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';

const ACTIVE_STATUSES = [
  'transcribing',
  'detecting',
  'planning_broll',
  'rendering_preview',
] as const;

export const projectsRouter = router({
  // Called after the client finishes the R2 upload (§5.1). Debits transcription
  // credits, then enqueues the pipeline's first job.
  create: protectedProcedure.input(createProjectInput).mutation(async ({ ctx, input }) => {
    const [active] = await db
      .select({ n: count() })
      .from(projects)
      .where(and(eq(projects.userId, ctx.userId), inArray(projects.status, [...ACTIVE_STATUSES])));
    if ((active?.n ?? 0) >= MAX_CONCURRENT_PROJECTS_PER_USER) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many projects in progress' });
    }

    const [project] = await db
      .insert(projects)
      .values({
        userId: ctx.userId,
        filename: input.filename,
        sourceVideoR2Key: input.r2Key,
        durationMs: input.durationMs,
        sizeBytes: input.sizeBytes,
        brollMode: input.brollMode,
        libraryCollectionId: input.libraryCollectionId ?? null,
        status: 'uploaded',
      })
      .returning();
    if (!project) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    const minutes = Math.ceil(input.durationMs / 60_000);
    const cost = minutes * CREDIT_COSTS.transcribePerMinute + CREDIT_COSTS.clipDetectionPerProject;
    try {
      await debitCredits(ctx.userId, cost, `pipeline:${project.id}`);
    } catch {
      await db.delete(projects).where(eq(projects.id, project.id));
      throw new TRPCError({ code: 'PAYMENT_REQUIRED', message: 'Not enough credits' });
    }

    await enqueue(
      QUEUE.transcribe,
      {
        projectId: project.id,
        userId: ctx.userId,
        sourceVideoR2Key: project.sourceVideoR2Key,
        durationMs: project.durationMs,
      },
      `transcribe:${project.id}`,
    );

    return { projectId: project.id };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.userId)))
        .limit(1);
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      const projectClips = await db
        .select()
        .from(clips)
        .where(eq(clips.projectId, project.id))
        .orderBy(desc(clips.viralScore));
      return { project, clips: projectClips };
    }),

  list: protectedProcedure.input(listProjectsInput).query(async ({ ctx, input }) => {
    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.userId, ctx.userId),
          input.cursor ? lt(projects.createdAt, new Date(input.cursor)) : undefined,
        ),
      )
      .orderBy(desc(projects.createdAt))
      .limit(input.limit + 1);

    let nextCursor: string | undefined;
    if (rows.length > input.limit) {
      const last = rows.pop();
      nextCursor = last?.createdAt.toISOString();
    }
    return { items: rows, nextCursor };
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(projects)
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.userId)));
      return { ok: true };
    }),

  // Switch B-roll sourcing mode + collection (§7). Clips are re-planned via
  // clips.regenerateBroll afterwards.
  setBrollMode: protectedProcedure.input(setBrollModeInput).mutation(async ({ ctx, input }) => {
    const res = await db
      .update(projects)
      .set({ brollMode: input.brollMode, libraryCollectionId: input.libraryCollectionId ?? null })
      .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId)))
      .returning({ id: projects.id });
    if (res.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
    return { ok: true };
  }),
});
