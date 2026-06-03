// PATCH  /api/schedule/posts/:id — edit caption / scheduledAt (only while 'scheduled')
// DELETE /api/schedule/posts/:id — cancel (status → 'canceled')

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const patchSchema = z.object({
  caption: z.string().max(2200).nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
});

async function loadPost(userId: string, id: string) {
  return prisma.scheduledPost.findFirst({ where: { id, userId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const post = await loadPost(ctx.user.id, id);
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (post.status !== 'scheduled') {
    return NextResponse.json({ error: 'not_editable', status: post.status }, { status: 409 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const updated = await prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      caption: body.caption === undefined ? undefined : body.caption,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
    },
  });
  return NextResponse.json({ ok: true, post: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const post = await loadPost(ctx.user.id, id);
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // Can't cancel something already mid-publish or done.
  if (post.status === 'publishing' || post.status === 'published') {
    return NextResponse.json({ error: 'not_cancelable', status: post.status }, { status: 409 });
  }
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: 'canceled' },
  });
  return NextResponse.json({ ok: true });
}
