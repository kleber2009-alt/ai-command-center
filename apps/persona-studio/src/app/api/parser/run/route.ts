// POST /api/parser/run — синхронно запустить парсер для текущего юзера.
// Шаги: читаем config → скрейпим все competitors+hashtags через Apify →
// classify+rank → Claude fit-to-niche → пишем ParserRun + ParserItem[] →
// возвращаем фронту полный JSON с результатами.
//
// Long-running: до ~90s (Apify до 60s + Claude ~5-10s). На Vercel/serverless
// этого не пройдёт, на нашем self-hosted docker — без ограничений.
// runtime='nodejs' обязателен (fetch+AbortSignal.timeout, env, prisma).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isApifyConfigured, scrapeAccountPosts, scrapeHashtagPosts, type ApifyItem } from '@/lib/parser/apify';
import {
  classify,
  filterReelsByThresholds,
  filterCarouselsByThresholds,
  rankReels,
  rankCarousels,
} from '@/lib/parser/scoring';
import { rateWithClaude } from '@/lib/parser/claude';
import type { ScoredPost } from '@/lib/parser/types';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  if (!isApifyConfigured()) {
    return NextResponse.json(
      { error: 'apify_not_configured', message: 'APIFY_TOKEN не задан в окружении сервера.' },
      { status: 503 },
    );
  }

  const cfg = await prisma.parserConfig.findUnique({ where: { userId: user.id } });
  if (!cfg) {
    return NextResponse.json(
      { error: 'no_config', message: 'Сначала сохрани настройки парсера (ниша + источники).' },
      { status: 409 },
    );
  }
  if (cfg.competitors.length === 0 && cfg.hashtags.length === 0) {
    return NextResponse.json(
      { error: 'no_targets', message: 'Добавь хотя бы один аккаунт или хэштег.' },
      { status: 409 },
    );
  }

  const run = await prisma.parserRun.create({
    data: { userId: user.id, status: 'processing' },
  });

  try {
    const opts = { days: cfg.postedWithinDays, limit: cfg.perTargetLimit };
    const errors: string[] = [];
    const allItems: ApifyItem[] = [];

    // Параллельный fan-out по всем источникам. Раньше было sequential с
    // комментом про rate-limit, но на N≥8 это 8×65s = 520s — клиент успевает
    // получить «Unexpected end of JSON input» до того, как роут закончит.
    // Apify free-plan позволяет до 25 параллельных runs одного actor'а,
    // на платных — больше; для большинства юзеров 8-30 fan-out безопасен.
    const tasks: Array<Promise<{ label: string; result: Awaited<ReturnType<typeof scrapeAccountPosts>> }>> = [
      ...cfg.competitors.map((handle) =>
        scrapeAccountPosts(handle, opts).then((result) => ({ label: `@${handle}`, result })),
      ),
      ...cfg.hashtags.map((tag) =>
        scrapeHashtagPosts(tag, opts).then((result) => ({ label: `#${tag}`, result })),
      ),
    ];
    const settled = await Promise.allSettled(tasks);
    for (const s of settled) {
      if (s.status === 'rejected') {
        errors.push(`fetch: ${String(s.reason).slice(0, 200)}`);
        continue;
      }
      const { label, result } = s.value;
      if (result.ok) allItems.push(...result.items);
      else errors.push(`${label}: ${result.error}`);
    }

    const cls = classify(allItems);
    const passedReels = filterReelsByThresholds(cls.reels, {
      minPlays: cfg.minPlays,
      minLikes: cfg.minLikes,
      minComments: cfg.minComments,
      minShares: cfg.minShares,
    });
    const passedCarousels = filterCarouselsByThresholds(cls.carousels, {
      minLikes: cfg.minCarouselLikes,
      minComments: cfg.minCarouselComments,
    });
    const topReels = rankReels(passedReels, cfg.reelsCount);
    const topCarousels = rankCarousels(passedCarousels, cfg.carouselsCount);

    let summary: string | null = null;
    let scoredReels: ScoredPost[] = topReels;
    let scoredCarousels: ScoredPost[] = topCarousels;
    const fitScores = new Map<string, { score: number; why: string }>();

    if (topReels.length > 0 || topCarousels.length > 0) {
      const rated = await rateWithClaude({
        niche: cfg.nicheDescription || '',
        userName: user.name || user.email.split('@')[0] || 'эксперт',
        reels: topReels,
        carousels: topCarousels,
      });
      summary = rated.summary;
      topReels.forEach((p, i) => {
        const r = rated.reels[i];
        if (r) fitScores.set(p.url, r);
      });
      topCarousels.forEach((p, i) => {
        const r = rated.carousels[i];
        if (r) fitScores.set(p.url, r);
      });
      // Если Claude дал оценки — пересортируем top по fitScore desc, тогда
      // самые релевантные нише посты будут наверху списка.
      const sortByFit = (posts: ScoredPost[]) =>
        [...posts].sort((a, b) => {
          const sa = fitScores.get(a.url)?.score ?? -1;
          const sb = fitScores.get(b.url)?.score ?? -1;
          if (sa !== sb) return sb - sa;
          return b.velocityScore - a.velocityScore;
        });
      scoredReels = sortByFit(topReels);
      scoredCarousels = sortByFit(topCarousels);
    }

    // Сохраняем все items в БД одним батчем
    const toCreate = [...scoredReels, ...scoredCarousels].map((p) => {
      const fit = fitScores.get(p.url);
      return {
        userId: user.id,
        runId: run.id,
        url: p.url,
        shortcode: p.shortcode,
        kind: p.kind,
        owner: p.owner,
        thumbnailUrl: p.thumbnailUrl,
        caption: p.caption || null,
        plays: p.plays,
        likes: p.likes,
        comments: p.comments,
        ageHours: p.ageHours,
        velocityScore: p.velocityScore,
        fitScore: fit?.score ?? null,
        fitWhy: fit?.why ?? null,
        status: 'new',
      };
    });

    if (toCreate.length > 0) {
      await prisma.parserItem.createMany({ data: toCreate });
    }

    await prisma.parserRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        postsScanned: allItems.length,
        reelsFound: scoredReels.length,
        carouselsFound: scoredCarousels.length,
        claudeSummary: summary,
        errorMsg: errors.length ? errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
        completedAt: new Date(),
      },
    });

    const items = await prisma.parserItem.findMany({
      where: { runId: run.id },
      orderBy: [{ fitScore: 'desc' }, { velocityScore: 'desc' }],
    });

    return NextResponse.json({
      ok: true,
      runId: run.id,
      postsScanned: allItems.length,
      reels: scoredReels.length,
      carousels: scoredCarousels.length,
      summary,
      errors,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/parser/run] failed', e);
    await prisma.parserRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMsg: msg.slice(0, 1000), completedAt: new Date() },
    });
    return NextResponse.json({ error: 'parser_run_failed', message: msg }, { status: 500 });
  }
}
