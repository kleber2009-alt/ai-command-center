import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError } from '@/lib/tokens';
import { queueForName } from '@/lib/queue';
import { engineConfig, isEnabledEngine, type VideoEngine } from '@/lib/video-engines';

export const runtime = 'nodejs';

const Body = z
  .object({
    avatarId: z.string().min(1),
    engine: z.string().default('heygen-v5'),
    script: z.string().min(5).max(1500).optional(),
    voiceId: z.string().min(1).optional(),
    audioUrl: z.string().url().optional(),
    language: z.string().max(8).optional(),
    aspect: z.enum(['9:16', '1:1', '16:9']).optional().default('9:16'),
    quality: z.enum(['1080p', '2k']).optional().default('2k'),
    background: z.string().max(32).optional(),
    subtitles: z.boolean().optional().default(true),
    heygenVersion: z.enum(['V', 'IV']).optional(),
    motionPrompt: z.string().max(2000).optional(),
  })
  .refine((d) => isEnabledEngine(d.engine), { message: 'engine_disabled', path: ['engine'] });

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;
  const engine = data.engine as VideoEngine;
  const cfg = engineConfig(engine);

  // Engine-specific input validation
  if (cfg.inputMode === 'script') {
    const hasOverride = !!data.audioUrl;
    if (!hasOverride) {
      if (!data.script || data.script.trim().length < 5) {
        return NextResponse.json({ error: 'script_required' }, { status: 400 });
      }
      if (!data.voiceId) {
        return NextResponse.json({ error: 'voice_required' }, { status: 400 });
      }
    }
  } else if (cfg.inputMode === 'audio') {
    if (!data.audioUrl) {
      return NextResponse.json({ error: 'audio_url_required' }, { status: 400 });
    }
  }

  if (!cfg.supportedAspects.includes(data.aspect)) {
    return NextResponse.json(
      { error: 'aspect_unsupported', supported: cfg.supportedAspects },
      { status: 400 },
    );
  }

  const avatar = await prisma.avatar.findFirst({ where: { id: data.avatarId, userId: user.id } });
  if (!avatar) return NextResponse.json({ error: 'avatar_not_found' }, { status: 404 });
  if (avatar.status !== 'done' || !avatar.imageUrl) {
    return NextResponse.json({ error: 'avatar_not_ready' }, { status: 409 });
  }

  try {
    await chargeTokens({
      userId: user.id,
      amount: cfg.cost,
      reason: `video:${engine}`,
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
      avatarId: data.avatarId,
      engine,
      script: data.script ?? null,
      audioUrl: data.audioUrl ?? null,
      voiceId: data.voiceId ?? null,
      language: data.language ?? 'ru',
      aspect: data.aspect,
      quality: data.quality,
      background: data.background ?? '#000000',
      subtitles: data.subtitles,
      heygenVersion: data.heygenVersion ?? cfg.heygenVersion ?? 'V',
      motionPrompt: data.motionPrompt ?? null,
      status: 'pending',
      tokensCost: cfg.cost,
    },
  });

  try {
    await queueForName(cfg.queueName).add(
      'generate',
      { videoId: video.id, userId: user.id },
      { jobId: video.id },
    );
  } catch {
    await refundTokens({
      userId: user.id,
      amount: cfg.cost,
      reason: `video:${engine}:enqueue-failed`,
      refId: video.id,
    });
    await prisma.videoGeneration.update({
      where: { id: video.id },
      data: { status: 'failed', errorMsg: 'enqueue_failed' },
    });
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  return NextResponse.json({ id: video.id, status: video.status, engine });
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

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
