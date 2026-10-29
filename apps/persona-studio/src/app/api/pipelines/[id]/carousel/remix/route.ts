// POST /api/pipelines/:id/carousel/remix — build the remix draft from the
// branch's source carousel (skill ilia-carousel-style): original slides stay,
// AI proposes hooks A/B, a new CTA code word, caption and slide order.
// Body: { regenerate?: boolean } — an existing draft is returned as is unless
// regenerate=true (then hooks/order/caption are proposed again, edits lost).
//
// Costs COSTS.studioScript when the AI writes the copy (refunded when it
// fails and the template fallback is used instead).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { isClaudeConfigured } from '@/lib/research/claude';
import { carouselView, createRemix, isCtxError, loadCarouselCtx } from '@/lib/carousel/remix-server';

export const runtime = 'nodejs';
export const maxDuration = 180;

const Body = z.object({ regenerate: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const userId = auth.user.id;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });

  const ctx = await loadCarouselCtx(userId, id);
  if (isCtxError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.draft?.remix && !parsed.data.regenerate) return NextResponse.json(await carouselView(ctx));
  if (ctx.pipeline.scheduledPostId) {
    return NextResponse.json({ error: 'already_in_flight', message: 'Карусель уже запланирована — ремикс менять нельзя.' }, { status: 409 });
  }

  const cost = isClaudeConfigured() ? COSTS.studioScript : 0;
  try {
    await chargeTokens({ userId, amount: cost, reason: 'studio-script:carousel-remix', refId: ctx.pipeline.id });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json({ error: 'insufficient_tokens', have: e.have, need: e.need }, { status: 402 });
    }
    throw e;
  }

  try {
    const cfg = await prisma.parserConfig.findUnique({ where: { userId }, select: { nicheDescription: true } });
    const r = await createRemix(ctx, { userId, niche: cfg?.nicheDescription });
    if ('error' in r) {
      await refundTokens({ userId, amount: cost, reason: 'studio-script:carousel-remix:failed', refId: ctx.pipeline.id });
      return NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
    }
    if (!r.usedAi) {
      await refundTokens({ userId, amount: cost, reason: 'studio-script:carousel-remix:failed', refId: ctx.pipeline.id });
      if (r.aiError) console.warn('[carousel/remix] AI copy unavailable, template used:', r.aiError);
    }
    const fresh = await loadCarouselCtx(userId, id);
    if (isCtxError(fresh)) return NextResponse.json({ error: fresh.error }, { status: fresh.status });
    return NextResponse.json({ ...(await carouselView(fresh)), usedAi: r.usedAi });
  } catch (e) {
    console.error('[carousel/remix] failed', e);
    await refundTokens({ userId, amount: cost, reason: 'studio-script:carousel-remix:failed', refId: ctx.pipeline.id });
    return NextResponse.json({ error: 'remix_failed' }, { status: 500 });
  }
}
