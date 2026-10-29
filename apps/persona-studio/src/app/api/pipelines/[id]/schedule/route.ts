// POST /api/pipelines/:id/schedule — publish the branch's result:
// { accountIds, caption?, scheduledAt } or { accountIds, caption?, now: true }.
// Reel → the finished montage (sourceType montage) or, when montage was
// skipped, the raw video; carousel → its rendered draft. Reuses the schedule
// API's creation logic and links scheduledPostId.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createScheduledPost } from '@/lib/publish/create-post';
import { findPipeline, pipelineView } from '@/lib/pipeline/server';
import { MONTAGE_NONE } from '@/lib/pipeline/types';

export const runtime = 'nodejs';

const Body = z
  .object({
    accountIds: z.array(z.string().min(1)).min(1).max(10),
    caption: z.string().max(2200).optional(),
    scheduledAt: z.string().datetime().optional(),
    now: z.boolean().optional(),
  })
  .refine((d) => d.now || d.scheduledAt, { message: 'scheduledAt or now required' });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const userId = ctx.user.id;
  const { id } = await params;

  const p = await findPipeline(userId, id);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  const data = parsed.data;

  if (p.scheduledPostId) {
    const prev = await prisma.scheduledPost.findFirst({ where: { id: p.scheduledPostId }, select: { status: true } });
    if (prev && ['scheduled', 'publishing', 'published', 'partial'].includes(prev.status)) {
      return NextResponse.json({ error: 'already_in_flight', status: prev.status }, { status: 409 });
    }
  }

  let sourceType: 'video' | 'montage' | 'carousel';
  let sourceId: string | null;
  if (p.kind === 'carousel') {
    sourceType = 'carousel';
    sourceId = p.carouselDraftId;
  } else if (p.montageId && p.montageStyle !== MONTAGE_NONE) {
    sourceType = 'montage';
    sourceId = p.montageId;
  } else {
    sourceType = 'video';
    sourceId = p.videoGenerationId;
  }
  if (!sourceId) return NextResponse.json({ error: 'source_not_ready' }, { status: 409 });

  const scheduledAt = data.now ? new Date().toISOString() : data.scheduledAt!;
  const r = await createScheduledPost(userId, {
    sourceType,
    sourceId,
    caption: data.caption,
    scheduledAt,
    accountIds: data.accountIds,
  });
  if (r.status !== 201) return NextResponse.json(r.body, { status: r.status });

  const post = r.body.post as { id: string };
  const row = await prisma.pipeline.update({ where: { id: p.id }, data: { scheduledPostId: post.id, errorMsg: null } });
  return NextResponse.json({ ok: true, postId: post.id, pipeline: await pipelineView(row) }, { status: 201 });
}
