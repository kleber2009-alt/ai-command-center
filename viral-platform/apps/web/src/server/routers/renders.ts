import { TRPCError } from '@trpc/server';
import { clips, db, debitCredits, projects, renders } from '@vp/db';
import { QUEUE, enqueue } from '@vp/queue';
import { CREDIT_COSTS, startRenderInput } from '@vp/shared';
import { presignDownload } from '@vp/storage';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';

async function ownedClip(userId: string, clipId: string) {
  const [row] = await db
    .select({ clip: clips, user: projects.userId })
    .from(clips)
    .innerJoin(projects, eq(clips.projectId, projects.id))
    .where(eq(clips.id, clipId))
    .limit(1);
  if (!row || row.user !== userId) throw new TRPCError({ code: 'NOT_FOUND' });
  return row.clip;
}

export const rendersRouter = router({
  // Debit render credits up front, create the render row, enqueue the job (§9).
  start: protectedProcedure.input(startRenderInput).mutation(async ({ ctx, input }) => {
    const clip = await ownedClip(ctx.userId, input.clipId);

    const cost =
      input.quality === '4k' ? CREDIT_COSTS.render4kPerClip : CREDIT_COSTS.render1080pPerClip;

    const [render] = await db
      .insert(renders)
      .values({
        clipId: clip.id,
        format: input.format,
        quality: input.quality,
        captionPreset: input.captionPreset,
        status: 'queued',
      })
      .returning();
    if (!render) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    try {
      await debitCredits(ctx.userId, cost, `render:${render.id}`);
    } catch {
      await db.delete(renders).where(eq(renders.id, render.id));
      throw new TRPCError({ code: 'PAYMENT_REQUIRED', message: 'Not enough credits' });
    }

    await enqueue(QUEUE.renderFinal, {
      projectId: clip.projectId,
      userId: ctx.userId,
      clipId: clip.id,
      renderId: render.id,
      format: input.format,
      quality: input.quality,
      captionPreset: input.captionPreset,
      preview: false,
    });
    return { renderId: render.id };
  }),

  status: protectedProcedure
    .input(z.object({ renderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db
        .select({ render: renders, user: projects.userId })
        .from(renders)
        .innerJoin(clips, eq(renders.clipId, clips.id))
        .innerJoin(projects, eq(clips.projectId, projects.id))
        .where(eq(renders.id, input.renderId))
        .limit(1);
      if (!row || row.user !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });
      return row.render;
    }),

  download: protectedProcedure
    .input(z.object({ renderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db
        .select({ render: renders, user: projects.userId })
        .from(renders)
        .innerJoin(clips, eq(renders.clipId, clips.id))
        .innerJoin(projects, eq(clips.projectId, projects.id))
        .where(eq(renders.id, input.renderId))
        .limit(1);
      if (!row || row.user !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!row.render.outputR2Key)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Render not finished' });
      return { url: await presignDownload(row.render.outputR2Key) };
    }),
});
