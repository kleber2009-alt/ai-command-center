// POST /api/pipelines/:id/carousel/render — render the remix draft to final
// JPEG slides (src/lib/carousel/render-remix.ts in the original look, or the
// chosen carousel style for cover/CTA over the original images), store them
// in S3 and move the branch to `ready`.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CAROUSEL_STAGE, carouselView, isCtxError, loadCarouselCtx, renderRemixDraft } from '@/lib/carousel/remix-server';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const userId = auth.user.id;
  const { id } = await params;

  const ctx = await loadCarouselCtx(userId, id);
  if (isCtxError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const draft = ctx.draft;
  if (!draft?.remix) return NextResponse.json({ error: 'no_draft' }, { status: 409 });
  // a render left 'rendering' by a crashed process unlocks after 3 minutes
  if (draft.status === 'rendering' && Date.now() - draft.updatedAt.getTime() < 180_000) return NextResponse.json({ error: 'already_in_flight' }, { status: 409 });

  await prisma.carouselDraft.update({ where: { id: draft.id }, data: { status: 'rendering', errorMsg: null } });
  try {
    const cfg = await prisma.parserConfig.findUnique({ where: { userId }, select: { ownHandle: true } });
    const imageUrls = await renderRemixDraft(draft, { userId, handle: cfg?.ownHandle ?? ctx.item?.owner ?? undefined });
    await prisma.carouselDraft.update({
      where: { id: draft.id },
      data: { status: 'rendered', imageUrls, slidesCount: imageUrls.length, completedAt: new Date(), errorMsg: null },
    });
    if (!ctx.pipeline.scheduledPostId) {
      await prisma.pipeline.update({ where: { id: ctx.pipeline.id }, data: { stage: CAROUSEL_STAGE.ready, errorMsg: null } });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[carousel/render] failed', e);
    await prisma.carouselDraft.update({ where: { id: draft.id }, data: { status: 'failed', errorMsg: msg.slice(0, 1000) } });
    return NextResponse.json({ error: 'render_failed', message: 'Не удалось отрисовать слайды — попробуйте ещё раз.' }, { status: 500 });
  }

  const fresh = await loadCarouselCtx(userId, id);
  if (isCtxError(fresh)) return NextResponse.json({ error: fresh.error }, { status: fresh.status });
  return NextResponse.json(await carouselView(fresh));
}
