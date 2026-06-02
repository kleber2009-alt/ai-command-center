// POST /api/research/reels/:id/analyze — глубокий разбор «почему залетело»
// (ТЗ §6.2, 5 кредитов). Pipeline:
//   1. Найти ролик + автора
//   2. Подтянуть свежий transcript (если есть) — иначе используем caption
//   3. charge 5 кредитов
//   4. analyzeReel (Claude Sonnet) → структурированный JSON
//   5. Сохранить ResearchAnalysis
//   6. Авто-собрать hooks из результата в ResearchHook (ТЗ §9)
//   7. Refund если Claude вернул ошибку

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { analyzeReel } from '@/lib/research/analyze';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const reel = await prisma.researchReel.findUnique({
    where: { id },
    include: {
      author: true,
      transcripts: { orderBy: { createdAt: 'desc' }, take: 1 },
      analyses: {
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!reel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Кэш: если уже есть анализ от этого юзера — отдаём без charge
  if (reel.analyses[0]) {
    return NextResponse.json({ ok: true, analysis: reel.analyses[0], cached: true });
  }

  const cost = COSTS.researchAnalyze;
  try {
    await chargeTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_analyze',
      refId: reel.id,
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
    const result = await analyzeReel({
      caption: reel.caption || '',
      transcript: reel.transcripts[0]?.text || null,
      metrics: {
        views: reel.views,
        likes: reel.likes,
        comments: reel.comments,
        virality: reel.virality,
        engagementRate: reel.engagementRate,
        durationSec: reel.durationSec,
        postedAt: reel.postedAt?.toISOString() ?? null,
      },
      authorContext: {
        username: reel.author.username,
        followers: reel.author.followers,
        medianViews: reel.author.medianViews,
      },
    });
    if (!result.ok) {
      await refundTokens({
        userId: ctx.user.id,
        amount: cost,
        reason: 'research_analyze_failed',
        refId: reel.id,
      });
      return NextResponse.json(
        { error: 'analyze_failed', message: result.error },
        { status: result.status || 502 },
      );
    }

    const saved = await prisma.researchAnalysis.create({
      data: {
        reelId: reel.id,
        userId: ctx.user.id,
        hooks: result.data.hooks,
        storytelling: result.data.storytelling,
        format: result.data.format,
        style: result.data.style,
        whyViral: result.data.why_viral,
        recommendations: result.data.recommendations,
        model: result.model,
        tokensCost: cost,
      },
    });

    // ── Авто-сбор хуков в галерею (ТЗ §9 источник 1) ──
    // Создаём по одной записи на хук. Не делаем uniqueness — допустимо,
    // что один и тот же хук вылетит из двух разных рилсов: тогда оба
    // попадут в галерею с разным sourceReelId и sourceViews.
    if (result.data.hooks.length > 0) {
      await prisma.researchHook.createMany({
        data: result.data.hooks.map((h) => ({
          text: h.text,
          formula: String(h.formula || 'свои').toLowerCase(),
          sourceReelId: reel.id,
          sourceViews: reel.views,
          niche: null,
          language: reel.language,
          origin: 'auto',
          isCustom: false,
          userId: null, // глобальный пул, не привязан к юзеру
        })),
        skipDuplicates: false,
      });
    }

    return NextResponse.json({ ok: true, analysis: saved, cached: false });
  } catch (e) {
    await refundTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_analyze_error',
      refId: reel.id,
    });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'analyze_error', message: msg }, { status: 500 });
  }
}
