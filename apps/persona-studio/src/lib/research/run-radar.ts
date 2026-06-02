// Запуск радара: внутри переиспользуем тот же search-пайплайн что
// /api/research/search, но напрямую через функцию, без HTTP. Так что
// один и тот же код обслуживает и ручной POST /radars/:id/run, и
// будущий cron, который пройдётся по enabled-радарам с
// (now - lastRunAt) > intervalHrs.
//
// Главная разница с /research/search: радар НЕ делает гейтинг по
// демо-N, не пишет ResearchSearch для пользователя (он не в сессии),
// и возвращает дельту "что нового" — сравнивает с lastResultIds.

import { prisma } from '@/lib/prisma';
import { type ApifyItem, scrapeHashtagPosts } from '@/lib/parser/apify';
import { classify } from '@/lib/parser/scoring';
import type { ScoredPost } from '@/lib/parser/types';
import { expandNiche } from './expand-niche';
import { indexAuthor } from './index-author';
import { computeReelMetrics, computeViralScores, type ScoreInput } from './metrics';
import { captionHash, dedupeByCaption } from './dedupe';

export type RadarRunResult = {
  ok: true;
  radarId: string;
  reelIds: string[];
  newReelIds: string[];
  scraped: number;
  durationMs: number;
  errors: string[];
};

export async function runRadar(radarId: string, opts: { maxNewAuthors?: number } = {}): Promise<RadarRunResult | { ok: false; error: string }> {
  const started = Date.now();
  const radar = await prisma.researchRadar.findUnique({ where: { id: radarId } });
  if (!radar) return { ok: false, error: 'radar_not_found' };

  const filters = (radar.filters as Record<string, unknown>) || {};

  // 1. expand niche
  const expansion = await expandNiche(radar.niche);
  const tagsToScrape = expansion.hashtags.length > 0
    ? expansion.hashtags
    : [radar.niche.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()].filter(Boolean);

  // 2. scrape
  const errors: string[] = [];
  const allItems: ApifyItem[] = [];
  const settled = await Promise.allSettled(
    tagsToScrape.map((tag) =>
      scrapeHashtagPosts(tag, { days: 30, limit: 25 }).then((r) => ({ tag, r })),
    ),
  );
  for (const s of settled) {
    if (s.status === 'rejected') {
      errors.push(`scrape: ${String(s.reason).slice(0, 200)}`);
      continue;
    }
    const { tag, r } = s.value;
    if (r.ok) allItems.push(...r.items);
    else errors.push(`#${tag}: ${r.error}`);
  }

  // 3. classify, index unknown authors
  const cls = classify(allItems);
  const candidates: ScoredPost[] = cls.reels;
  const uniqueOwners = Array.from(
    new Set(candidates.map((c) => c.owner?.toLowerCase()).filter((o): o is string => Boolean(o))),
  );
  const existing = await prisma.researchAuthor.findMany({
    where: { platform: 'instagram', username: { in: uniqueOwners } },
    select: { username: true },
  });
  const existingSet = new Set(existing.map((a) => a.username));
  const needsIndexing = uniqueOwners.filter((u) => !existingSet.has(u));
  const toIndex = needsIndexing.slice(0, opts.maxNewAuthors ?? 5);
  await Promise.allSettled(toIndex.map((u) => indexAuthor(u)));

  const allAuthors = await prisma.researchAuthor.findMany({
    where: { platform: 'instagram', username: { in: uniqueOwners } },
  });
  const authorByName = new Map(allAuthors.map((a) => [a.username, a]));

  // 4. compute per-reel metrics + viralScore percentile within current corpus
  const enriched = candidates
    .map((c) => {
      const ownerKey = c.owner?.toLowerCase() || '';
      const author = authorByName.get(ownerKey);
      if (!author || !c.shortcode) return null;
      const metrics = computeReelMetrics({
        views: c.plays,
        likes: c.likes,
        comments: c.comments,
        postedAtMs: c.postedAtMs,
        authorMedianViews: author.medianViews,
        authorFollowers: author.followers,
      });
      return { c, author, metrics };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const scoreInputs: ScoreInput[] = enriched.map((e) => ({
    reach: e.metrics.reach,
    engagementRate: e.metrics.engagementRate,
    velocity: e.metrics.velocity,
    virality: e.metrics.virality,
  }));
  const viralScores = computeViralScores(scoreInputs);

  // 5. upsert reels
  await Promise.all(
    enriched.map(async ({ c, author, metrics }, idx) => {
      await prisma.researchReel.upsert({
        where: { platform_externalId: { platform: 'instagram', externalId: c.shortcode! } },
        create: {
          platform: 'instagram',
          externalId: c.shortcode!,
          authorId: author.id,
          url: c.url,
          thumbnailUrl: c.thumbnailUrl,
          caption: c.caption || null,
          captionHash: captionHash(c.caption || ''),
          postedAt: c.postedAtMs ? new Date(c.postedAtMs) : null,
          views: c.plays,
          likes: c.likes,
          comments: c.comments,
          shares: c.shares,
          postType: 'reel',
          virality: metrics.virality,
          engagementRate: metrics.engagementRate,
          velocity: metrics.velocity,
          viralScore: viralScores[idx],
          reach: metrics.reach,
        },
        update: {
          views: c.plays,
          likes: c.likes,
          comments: c.comments,
          shares: c.shares,
          caption: c.caption || null,
          captionHash: captionHash(c.caption || ''),
          virality: metrics.virality,
          engagementRate: metrics.engagementRate,
          velocity: metrics.velocity,
          viralScore: viralScores[idx],
          reach: metrics.reach,
        },
      });
    }),
  );

  // 6. read back with period filter, dedupe, sort by viralScore
  const periodDays = filters.period === '7d' ? 7 : filters.period === '30d' ? 30 : filters.period === '90d' ? 90 : null;
  const cutoff = periodDays ? new Date(Date.now() - periodDays * 86_400_000) : null;
  const dbReels = await prisma.researchReel.findMany({
    where: {
      platform: 'instagram',
      externalId: { in: enriched.map((e) => e.c.shortcode!) },
      ...(cutoff ? { postedAt: { gte: cutoff } } : {}),
    },
    select: { id: true, captionHash: true, viralScore: true },
  });
  let rows: typeof dbReels = dbReels;
  rows = dedupeByCaption(rows);
  rows.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
  const reelIds = rows.slice(0, 60).map((r) => r.id);

  // 7. diff vs previous run
  const prev = new Set(radar.lastResultIds);
  const newReelIds = reelIds.filter((id) => !prev.has(id));

  // 8. persist
  await prisma.researchRadar.update({
    where: { id: radar.id },
    data: { lastRunAt: new Date(), lastResultIds: reelIds },
  });

  return {
    ok: true,
    radarId: radar.id,
    reelIds,
    newReelIds,
    scraped: allItems.length,
    durationMs: Date.now() - started,
    errors,
  };
}
