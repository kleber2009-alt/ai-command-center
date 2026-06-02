// POST /api/research/authors/:id/refresh — «Обновить статистику» (5 кр.).
// Делает force-rescrape автора через indexAuthor → пересчёт медианы +
// upsert рилсов с новыми метриками.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { indexAuthor } from '@/lib/research/index-author';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const author = await prisma.researchAuthor.findUnique({ where: { id } });
  if (!author) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const cost = COSTS.researchRefreshAuthor;
  try {
    await chargeTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_refresh_author',
      refId: author.id,
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

  try {
    const result = await indexAuthor(author.username, { force: true });
    if (result.error && result.reelCount === 0) {
      await refundTokens({
        userId: ctx.user.id,
        amount: cost,
        reason: 'research_refresh_failed',
        refId: author.id,
      });
      return NextResponse.json(
        { error: 'refresh_failed', message: result.error },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    await refundTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_refresh_error',
      refId: author.id,
    });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'refresh_error', message: msg }, { status: 500 });
  }
}
