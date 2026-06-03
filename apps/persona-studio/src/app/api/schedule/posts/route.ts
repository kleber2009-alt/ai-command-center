// GET  /api/schedule/posts  — list the user's scheduled posts (+ targets)
// POST /api/schedule/posts  — create a scheduled post from a ready video/edit
//
// On create we snapshot the source's final mp4 into mediaUrl, fan it out into
// one PostTarget per chosen SocialAccount, and — if scheduledAt is already due
// — enqueue it immediately (otherwise the schedule-cron sweep picks it up).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { enqueuePostNow } from '@/lib/publish';

export const runtime = 'nodejs';

const Body = z.object({
  sourceType: z.enum(['video', 'edit']),
  sourceId: z.string().min(1),
  caption: z.string().max(2200).optional(),
  scheduledAt: z.string().datetime(),
  accountIds: z.array(z.string().min(1)).min(1).max(10),
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const posts = await prisma.scheduledPost.findMany({
    where: { userId: ctx.user.id },
    orderBy: { scheduledAt: 'desc' },
    take: 200,
    include: {
      targets: {
        include: { socialAccount: { select: { platform: true, displayName: true } } },
      },
    },
  });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const userId = ctx.user.id;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { sourceType, sourceId, caption, scheduledAt, accountIds } = parsed.data;

  // Resolve the source mp4 and verify ownership + readiness.
  let mediaUrl: string | null = null;
  if (sourceType === 'video') {
    const v = await prisma.videoGeneration.findFirst({ where: { id: sourceId, userId } });
    if (!v) return NextResponse.json({ error: 'source_not_found' }, { status: 404 });
    if (v.status !== 'completed' || !v.videoUrl) {
      return NextResponse.json({ error: 'source_not_ready', status: v.status }, { status: 409 });
    }
    mediaUrl = v.videoUrl;
  } else {
    const e = await prisma.videoEdit.findFirst({ where: { id: sourceId, userId } });
    if (!e) return NextResponse.json({ error: 'source_not_found' }, { status: 404 });
    if (e.status !== 'completed' || !e.resultUrl) {
      return NextResponse.json({ error: 'source_not_ready', status: e.status }, { status: 409 });
    }
    mediaUrl = e.resultUrl;
  }

  // Verify all targets belong to the user and are active.
  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds }, userId },
  });
  if (accounts.length !== accountIds.length) {
    return NextResponse.json({ error: 'account_not_found' }, { status: 404 });
  }
  const inactive = accounts.find((a) => a.status !== 'active');
  if (inactive) {
    return NextResponse.json(
      { error: 'account_inactive', accountId: inactive.id, status: inactive.status },
      { status: 409 },
    );
  }

  const when = new Date(scheduledAt);

  const post = await prisma.scheduledPost.create({
    data: {
      userId,
      sourceType,
      videoGenerationId: sourceType === 'video' ? sourceId : null,
      videoEditId: sourceType === 'edit' ? sourceId : null,
      mediaUrl,
      caption: caption ?? null,
      scheduledAt: when,
      status: 'scheduled',
      targets: {
        create: accounts.map((a) => ({
          socialAccountId: a.id,
          platform: a.platform,
          status: 'pending',
        })),
      },
    },
    include: { targets: true },
  });

  // Due now (or in the past) → enqueue immediately instead of waiting a tick.
  if (when.getTime() <= Date.now()) {
    await enqueuePostNow(post.id);
  }

  return NextResponse.json({ ok: true, post }, { status: 201 });
}
