import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { videoQueue } from '@/lib/queue';

export const runtime = 'nodejs';

const Body = z.object({
  avatarId: z.string().min(1),
  script: z.string().min(5).max(1500),
  voiceId: z.string().min(1),
  language: z.string().max(8).optional(),
  aspect: z.enum(['9:16', '1:1', '16:9']).optional().default('9:16'),
  background: z.string().max(32).optional(),
  subtitles: z.boolean().optional().default(true),
  heygenVersion: z.enum(['V', 'IV']).optional().default('V'),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { avatarId, script, voiceId, language, aspect, background, subtitles, heygenVersion } = parsed.data;

  const avatar = await prisma.avatar.findFirst({ where: { id: avatarId, userId: user.id } });
  if (!avatar) return NextResponse.json({ error: 'avatar_not_found' }, { status: 404 });
  if (avatar.status !== 'done' || !avatar.imageUrl) {
    return NextResponse.json({ error: 'avatar_not_ready' }, { status: 409 });
  }

  try {
    await chargeTokens({
      userId: user.id,
      amount: COSTS.heygenVideo,
      reason: 'heygen-video',
    });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json(
        { error: 'insufficient_tokens', have: e.have, need: e.need },
        { status: 402 },
      );
    }
    throw e;
  }

  const video = await prisma.videoGeneration.create({
    data: {
      userId: user.id,
      avatarId,
      script,
      voiceId,
      language: language ?? 'ru',
      aspect,
      background: background ?? '#000000',
      subtitles,
      heygenVersion,
      status: 'pending',
      tokensCost: COSTS.heygenVideo,
    },
  });

  try {
    await videoQueue().add('generate', { videoId: video.id, userId: user.id }, { jobId: video.id });
  } catch {
    await refundTokens({
      userId: user.id,
      amount: COSTS.heygenVideo,
      reason: 'heygen-video:enqueue-failed',
      refId: video.id,
    });
    await prisma.videoGeneration.update({
      where: { id: video.id },
      data: { status: 'failed', errorMsg: 'enqueue_failed' },
    });
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  return NextResponse.json({ id: video.id, status: video.status });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const v = await prisma.videoGeneration.findFirst({
      where: { id, userId: user.id },
      include: { avatar: { select: { id: true, styleLabel: true, imageUrl: true } } },
    });
    if (!v) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(v);
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);
  const videos = await prisma.videoGeneration.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { avatar: { select: { id: true, styleLabel: true, imageUrl: true } } },
    take: limit,
  });
  return NextResponse.json({ videos });
}
