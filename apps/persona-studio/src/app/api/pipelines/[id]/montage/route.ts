// POST /api/pipelines/:id/montage — montage the branch's finished video in a
// Kadrik Studio style ({ style, wish?, ctaWord? }) via the same creation path
// as POST /api/montages, or skip montage ({ style: 'none' }).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/ratelimit';
import { prisma } from '@/lib/prisma';
import { refreshAppSettings } from '@/lib/app-settings';
import { createKadrikMontage } from '@/lib/montage/create-kadrik';
import { findKadrikStyle } from '@/lib/montage/kadrik-styles';
import { findPipeline, pipelineView } from '@/lib/pipeline/server';
import { MONTAGE_NONE } from '@/lib/pipeline/types';

export const runtime = 'nodejs';

const Body = z.object({
  style: z.string().min(1).max(100),
  wish: z.string().trim().max(1500).optional(),
  ctaWord: z.string().trim().max(24).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentUserOrApiKey(req);
    if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const limited = await enforceRateLimit(ctx, 'generate');
    if (limited) return limited;
    const userId = ctx.user.id;
    const { id } = await params;

    const p = await findPipeline(userId, id);
    if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (p.kind !== 'reel') return NextResponse.json({ error: 'bad_stage' }, { status: 409 });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
    const data = parsed.data;

    const video = p.videoGenerationId
      ? await prisma.videoGeneration.findFirst({ where: { id: p.videoGenerationId, userId }, select: { id: true, status: true } })
      : null;
    if (!video || video.status !== 'completed') return NextResponse.json({ error: 'video_not_ready' }, { status: 409 });

    if (p.montageId) {
      const m = await prisma.montage.findFirst({ where: { id: p.montageId }, select: { status: true } });
      if (m && (m.status === 'pending' || m.status === 'processing')) {
        return NextResponse.json({ error: 'generation_running' }, { status: 409 });
      }
    }

    if (data.style === MONTAGE_NONE) {
      const row = await prisma.pipeline.update({
        where: { id: p.id },
        data: { montageStyle: MONTAGE_NONE, montageId: null, scheduledPostId: null, errorMsg: null },
      });
      return NextResponse.json({ ok: true, pipeline: await pipelineView(row) });
    }

    const style = findKadrikStyle(data.style);
    if (!style) return NextResponse.json({ error: 'bad_style' }, { status: 400 });
    if (style.inp !== 'video' || style.format !== '9:16') {
      return NextResponse.json(
        { error: 'bad_style', message: 'Для рилса нужен вертикальный стиль монтажа — выберите из «Рилсов» или «Стилей @ilia.paliy».' },
        { status: 422 },
      );
    }

    await refreshAppSettings();
    const r = await createKadrikMontage(userId, {
      style: style.id,
      videoGenerationId: video.id,
      wish: data.wish || undefined,
      ctaWord: data.ctaWord || undefined,
    });
    if (r.status !== 200) return NextResponse.json(r.body, { status: r.status });

    const row = await prisma.pipeline.update({
      where: { id: p.id },
      data: { montageStyle: style.id, montageId: String(r.body.id), scheduledPostId: null, errorMsg: null },
    });
    return NextResponse.json({ ok: true, montageId: r.body.id, cost: r.body.cost, pipeline: await pipelineView(row) });
  } catch (e) {
    console.error('[api/pipelines/montage] unhandled', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
