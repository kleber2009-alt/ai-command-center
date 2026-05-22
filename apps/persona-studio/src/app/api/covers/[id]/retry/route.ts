import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { coverQueue } from '@/lib/queue';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const { id } = await params;

  const cover = await prisma.cover.findFirst({
    where: { id, userId: user.id },
    include: { avatar: true },
  });
  if (!cover) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (cover.status !== 'failed') {
    return NextResponse.json({ error: 'not_failed', status: cover.status }, { status: 409 });
  }
  if (cover.avatar.status !== 'done' || !cover.avatar.imageUrl) {
    return NextResponse.json({ error: 'avatar_not_ready' }, { status: 409 });
  }

  await prisma.cover.update({
    where: { id },
    data: { status: 'pending', errorMsg: null, completedAt: null },
  });

  const q = coverQueue();
  // drop stale job (same jobId from previous attempt) so the new add isn't deduped
  try {
    const stale = await q.getJob(id);
    if (stale) await stale.remove();
  } catch {
    // ignore — best effort
  }

  try {
    await q.add('generate', { coverId: id, userId: user.id }, { jobId: id });
  } catch {
    await prisma.cover.update({
      where: { id },
      data: { status: 'failed', errorMsg: 'retry_enqueue_failed' },
    });
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  return NextResponse.json({ id, status: 'pending' });
}
