// /api/montages — монтаж по скиллам (montazh-rils / YouTube «Монтаж ЭМ»).
// POST создаёт Montage, списывает токены и ставит задачу в очередь skill-montage.
// Источник: готовое видео (videoGenerationId) или своя запись, загруженная через
// /api/montages/upload (sourceUrl — только из своего S3-префикса, без SSRF).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/ratelimit';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { montageQueue } from '@/lib/queue';
import { publicUrl } from '@/lib/storage';
import { findMontagePreset, MONTAGE_PRESETS } from '@/lib/montage/presets';
import { hasWordTranscriber } from '@/lib/montage/transcribe-words';

export const runtime = 'nodejs';

const Body = z
  .object({
    videoGenerationId: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    style: z.string().refine((s) => Boolean(findMontagePreset(s)), {
      message: `unknown_style (allowed: ${MONTAGE_PRESETS.map((p) => p.id).join(', ')})`,
    }),
    hookTitle: z.string().trim().max(120).optional(),
    ctaWord: z.string().trim().max(24).optional(),
    options: z
      .object({
        cutSilence: z.boolean().default(true),
        subtitles: z.boolean().default(true),
        punch: z.boolean().default(true),
      })
      .default({}),
  })
  .refine((b) => Boolean(b.videoGenerationId) !== Boolean(b.sourceUrl), {
    message: 'нужен ровно один источник: videoGenerationId или sourceUrl',
  });

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentUserOrApiKey(req);
    if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const limited = await enforceRateLimit(ctx, 'generate');
    if (limited) return limited;
    const user = ctx.user;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
    }
    const data = parsed.data;
    const preset = findMontagePreset(data.style)!;

    if ((data.options.cutSilence || data.options.subtitles) && !hasWordTranscriber()) {
      return NextResponse.json(
        { error: 'no_transcriber', message: 'Для чистки пауз и субтитров нужен Whisper (OPENAI_API_KEY или WHISPER_SERVICE_URL).' },
        { status: 503 },
      );
    }

    let sourceUrl: string;
    let videoGenerationId: string | null = null;
    if (data.videoGenerationId) {
      const video = await prisma.videoGeneration.findFirst({ where: { id: data.videoGenerationId, userId: user.id } });
      if (!video) return NextResponse.json({ error: 'video_not_found' }, { status: 404 });
      if (video.status !== 'completed' || !video.videoUrl) {
        return NextResponse.json({ error: 'video_not_ready', status: video.status }, { status: 409 });
      }
      sourceUrl = video.videoUrl;
      videoGenerationId = video.id;
    } else {
      const own = publicUrl(`video/${user.id}/`);
      if (!data.sourceUrl!.startsWith(own)) {
        return NextResponse.json({ error: 'foreign_source', message: 'Источник должен быть загружен через /api/montages/upload.' }, { status: 400 });
      }
      sourceUrl = data.sourceUrl!;
    }

    const cost = COSTS.skillMontage;
    try {
      await chargeTokens({ userId: user.id, amount: cost, reason: `skill-montage:${preset.id}` });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        return NextResponse.json({ error: 'insufficient_tokens', have: e.have, need: e.need }, { status: 402 });
      }
      throw e;
    }

    const montage = await prisma.montage.create({
      data: {
        userId: user.id,
        videoGenerationId,
        sourceUrl,
        style: preset.id,
        format: preset.format,
        hookTitle: data.hookTitle || null,
        ctaWord: data.ctaWord || null,
        options: data.options,
        tokensCost: cost,
      },
    });

    try {
      await montageQueue().add('montage', { montageId: montage.id, userId: user.id }, { jobId: montage.id });
    } catch (e) {
      console.error('[api/montages] enqueue failed', e);
      await refundTokens({ userId: user.id, amount: cost, reason: 'skill-montage:enqueue-failed', refId: montage.id });
      await prisma.montage.update({ where: { id: montage.id }, data: { status: 'failed', errorMsg: 'enqueue_failed' } });
      return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
    }

    return NextResponse.json({ id: montage.id, status: montage.status });
  } catch (e) {
    console.error('[api/montages] unhandled error', e);
    return NextResponse.json({ error: 'internal_error', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

const LIST_SELECT = {
  id: true,
  style: true,
  format: true,
  hookTitle: true,
  ctaWord: true,
  status: true,
  resultUrl: true,
  durationSec: true,
  tokensCost: true,
  errorMsg: true,
  createdAt: true,
  completedAt: true,
  videoGenerationId: true,
} as const;

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const m = await prisma.montage.findFirst({ where: { id, userId: user.id }, select: LIST_SELECT });
    if (!m) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(m);
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);
  const montages = await prisma.montage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: LIST_SELECT,
  });
  return NextResponse.json({ montages });
}
