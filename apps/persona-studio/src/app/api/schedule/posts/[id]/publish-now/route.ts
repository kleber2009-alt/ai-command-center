// POST /api/schedule/posts/:id/publish-now — publish immediately.
// Sets scheduledAt=now and enqueues the targets directly (no waiting for sweep).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { enqueuePostNow } from '@/lib/publish';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const post = await prisma.scheduledPost.findFirst({ where: { id, userId: ctx.user.id } });
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (post.status === 'publishing' || post.status === 'published') {
    return NextResponse.json({ error: 'already_in_flight', status: post.status }, { status: 409 });
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { scheduledAt: new Date() },
  });
  const enqueued = await enqueuePostNow(post.id);

  return NextResponse.json({ ok: true, enqueued });
}
