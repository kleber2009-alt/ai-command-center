import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError } from '@/lib/tokens';
import { queueForName } from '@/lib/queue';
import { engineConfig, isEnabledEngine, type VideoEngine } from '@/lib/video-engines';

export const runtime = 'nodejs';

// Повтор упавшей генерации: создаём новую VideoGeneration с теми же параметрами,
// снова списываем токены (при ошибке они были возвращены воркером) и ставим в очередь.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentUserOrApiKey(req);
    if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const user = ctx.user;

    const { id } = await params;
    const prev = await prisma.videoGeneration.findFirst({ where: { id, userId: user.id } });
    if (!prev) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (!isEnabledEngine(prev.engine)) {
      return NextResponse.json({ error: 'engine_disabled' }, { status: 409 });
    }
    const engine = prev.engine as VideoEngine;
    const cfg = engineConfig(engine);

    const avatar = await prisma.avatar.findFirst({ where: { id: prev.avatarId, userId: user.id } });
    if (!avatar) return NextResponse.json({ error: 'avatar_not_found' }, { status: 404 });
    if (avatar.status !== 'done' || !avatar.imageUrl) {
      return NextResponse.json({ error: 'avatar_not_ready', status: avatar.status }, { status: 409 });
    }

    try {
      await chargeTokens({ userId: user.id, amount: cfg.cost, reason: `video:${engine}:retry` });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        return NextResponse.json({ error: 'insufficient_tokens', have: e.have, need: e.need }, { status: 402 });
      }
      throw e;
    }

    const video = await prisma.videoGeneration.create({
      data: {
        userId: user.id,
        avatarId: prev.avatarId,
        engine,
        script: prev.script,
        audioUrl: prev.audioUrl,
        voiceId: prev.voiceId,
        language: prev.language,
        aspect: prev.aspect,
        quality: prev.quality,
        background: prev.background,
        subtitles: prev.subtitles,
        heygenVersion: prev.heygenVersion,
        motionPrompt: prev.motionPrompt,
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
    } catch (e) {
      console.error('[api/videos/retry] enqueue failed', e);
      await refundTokens({
        userId: user.id,
        amount: cfg.cost,
        reason: `video:${engine}:retry-enqueue-failed`,
        refId: video.id,
      });
      await prisma.videoGeneration.update({
        where: { id: video.id },
        data: { status: 'failed', errorMsg: 'enqueue_failed' },
      });
      return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
    }

    return NextResponse.json({ id: video.id, status: video.status, engine });
  } catch (e) {
    console.error('[api/videos/retry] unhandled error', e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 });
  }
}
