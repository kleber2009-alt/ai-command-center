// GET  /api/schedule/posts  — list the user's scheduled posts (+ targets)
// POST /api/schedule/posts  — create a scheduled post from a ready video, edit,
//                             skill montage or rendered carousel
//
// On create we snapshot the source's final media into mediaUrl (a carousel
// stores its slide PNG URLs newline-separated, in order), fan it out into
// one PostTarget per chosen SocialAccount, and — if scheduledAt is already due
// — enqueue it immediately (otherwise the schedule-cron sweep picks it up).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createScheduledPost, ScheduleBody } from '@/lib/publish/create-post';

export const runtime = 'nodejs';

const Body = ScheduleBody;

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
  const r = await createScheduledPost(userId, parsed.data);
  return NextResponse.json(r.body, { status: r.status });
}
