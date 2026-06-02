// POST /api/research/authors/:id/analyze-page — глубокий разбор страницы
// автора (10 кр.). Если у автора в БД < 10 рилсов — сначала доскрейпим
// (через indexAuthor force=true), потом анализ.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { analyzePage } from '@/lib/research/analyze-page';
import { indexAuthor } from '@/lib/research/index-author';

export const runtime = 'nodejs';
export const maxDuration = 180;

const MIN_REELS_FOR_ANALYSIS = 5;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  let author = await prisma.researchAuthor.findUnique({
    where: { id },
    include: { reels: { orderBy: { postedAt: 'desc' }, take: 30 } },
  });
  if (!author) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Кэш разбора — если у юзера уже есть, отдаём без charge
  const cached = await prisma.researchPageAnalysis.findUnique({
    where: { authorId_userId: { authorId: author.id, userId: ctx.user.id } },
  });
  if (cached) {
    return NextResponse.json({ ok: true, analysis: cached, cached: true });
  }

  // Если рилсов мало — сначала ре-индексируем (бесплатно для юзера здесь;
  // это часть стоимости 10 кредитов за page-analyze).
  if (author.reels.length < MIN_REELS_FOR_ANALYSIS) {
    await indexAuthor(author.username, { force: true });
    author = await prisma.researchAuthor.findUnique({
      where: { id },
      include: { reels: { orderBy: { postedAt: 'desc' }, take: 30 } },
    });
    if (!author || author.reels.length === 0) {
      return NextResponse.json(
        { error: 'not_enough_reels', message: 'Не удалось набрать достаточно рилсов для анализа.' },
        { status: 422 },
      );
    }
  }

  const cost = COSTS.researchPageAnalyze;
  try {
    await chargeTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_page_analyze',
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
    const result = await analyzePage({
      author: {
        username: author.username,
        followers: author.followers,
        medianViews: author.medianViews,
        engagementAvg: author.engagementAvg,
      },
      reels: author.reels.map((r) => ({
        id: r.id,
        caption: r.caption,
        views: r.views,
        likes: r.likes,
        comments: r.comments,
        postedAt: r.postedAt?.toISOString() ?? null,
        virality: r.virality,
        engagementRate: r.engagementRate,
        durationSec: r.durationSec,
      })),
    });
    if (!result.ok) {
      await refundTokens({
        userId: ctx.user.id,
        amount: cost,
        reason: 'research_page_analyze_failed',
        refId: author.id,
      });
      return NextResponse.json(
        { error: 'analyze_failed', message: result.error },
        { status: result.status || 502 },
      );
    }
    const saved = await prisma.researchPageAnalysis.create({
      data: {
        authorId: author.id,
        userId: ctx.user.id,
        summary: result.data.summary,
        outliers: result.data.outliers,
        cadence: result.data.cadence,
        bestFormats: result.data.best_formats,
        bestTopics: result.data.best_topics,
        recurringHooks: result.data.recurring_hooks,
        recommendations: result.data.recommendations,
        model: result.model,
        tokensCost: cost,
      },
    });
    return NextResponse.json({ ok: true, analysis: saved, cached: false });
  } catch (e) {
    await refundTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_page_analyze_error',
      refId: author.id,
    });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'analyze_error', message: msg }, { status: 500 });
  }
}
