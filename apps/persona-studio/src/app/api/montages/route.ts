// /api/montages — монтаж по стилям Студии Кадрика (31 скилл Creator Pack).
// POST создаёт Montage, списывает токены и ставит задачу в очередь kadrik-montage:
// воркер отдаёт её боту Кадрика, тот монтирует скиллом через Claude Code.
// Вход по стилю: видео — готовое (videoGenerationId) или своя запись через
// /api/montages/upload (sourceUrl — только из своего S3-префикса, без SSRF);
// ссылка (link) или текст (script) — для скиллов, которым видео не нужно.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/ratelimit';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { kadrikMontageQueue } from '@/lib/queue';
import { publicUrl } from '@/lib/storage';
import { findKadrikStyle, kadrikCostFactor, kadrikRunnable, KADRIK_STYLES } from '@/lib/montage/kadrik-styles';
import { kadrikConfigured } from '@/lib/montage/kadrik';

export const runtime = 'nodejs';

const Body = z.object({
  style: z.string().refine((s) => Boolean(findKadrikStyle(s)), {
    message: `unknown_style (allowed: ${KADRIK_STYLES.map((p) => p.id).join(', ')})`,
  }),
  videoGenerationId: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  link: z.string().trim().url().max(500).optional(),
  script: z.string().trim().max(20_000).optional(),
  wish: z.string().trim().max(1500).optional(),
  ctaWord: z.string().trim().max(24).optional(),
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
    const style = findKadrikStyle(data.style)!;
    if (!kadrikRunnable(style)) {
      return NextResponse.json({ error: 'style_local_only', message: 'Этот инструмент работает с папкой футажей на машине бота — запусти его в Студии Кадрика.' }, { status: 422 });
    }
    if (!kadrikConfigured()) {
      return NextResponse.json(
        { error: 'kadrik_not_configured', message: 'Монтаж по стилям пока не подключён: администратору нужно указать адрес и ключ Студии Кадрика.' },
        { status: 503 },
      );
    }

    let sourceUrl = '';
    let videoGenerationId: string | null = null;
    if (style.inp === 'video') {
      if (Boolean(data.videoGenerationId) === Boolean(data.sourceUrl)) {
        return NextResponse.json({ error: 'bad_body', message: 'нужен ровно один источник: videoGenerationId или sourceUrl' }, { status: 400 });
      }
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
    } else if (style.inp === 'link') {
      if (!data.link) return NextResponse.json({ error: 'bad_body', message: 'нужна ссылка на видео' }, { status: 400 });
      sourceUrl = data.link;
    } else if (!data.script) {
      return NextResponse.json({ error: 'bad_body', message: 'нужен текст или сценарий' }, { status: 400 });
    }

    const cost = COSTS.kadrikMontage * kadrikCostFactor(style);
    try {
      await chargeTokens({ userId: user.id, amount: cost, reason: `kadrik-montage:${style.id}` });
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
        style: style.id,
        format: style.format,
        ctaWord: data.ctaWord || null,
        options: {
          ...(style.inp === 'link' ? { link: data.link } : {}),
          ...(style.inp === 'text' ? { script: data.script } : {}),
          ...(data.wish ? { wish: data.wish } : {}),
        },
        tokensCost: cost,
        progress: 'в очереди',
      },
    });

    try {
      await kadrikMontageQueue().add('montage', { montageId: montage.id, userId: user.id }, { jobId: montage.id });
    } catch (e) {
      console.error('[api/montages] enqueue failed', e);
      await refundTokens({ userId: user.id, amount: cost, reason: 'kadrik-montage:enqueue-failed', refId: montage.id });
      await prisma.montage.update({ where: { id: montage.id }, data: { status: 'failed', errorMsg: 'enqueue_failed' } });
      return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
    }

    return NextResponse.json({ id: montage.id, status: montage.status, cost });
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
  progress: true,
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
