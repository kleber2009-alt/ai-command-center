// POST /api/research/search — главный endpoint Этапа 1 ресёрча.
// Сценарий: пользователь вводит нишу → получает отранжированную ленту
// рилсов со всеми метриками + чипы-расширения ниши + сводный summary.
//
// Пайплайн (ТЗ §5):
//   1. expand-niche (Claude) → keywords + hashtags
//   2. search_cache hit? → отдаём кэш + не дёргаем Apify
//   3. Apify hashtag-search в параллель по всем хэштегам
//   4. Для каждого нового автора — фоновая индексация (ResearchAuthor +
//      медиана + рилсы автора с метриками)
//   5. Дедуп по externalId/captionHash, расчёт per-reel метрик и
//      viralScore относительно корпуса выдачи
//   6. Запись в search_cache + ResearchSearch (журнал), отдача с
//      сортировкой и применёнными фильтрами

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isApifyConfigured, type ApifyItem } from '@/lib/parser/apify';
import { guardedScrapeHashtag } from '@/lib/research/apify-budget';
import { classify } from '@/lib/parser/scoring';
import type { ScoredPost } from '@/lib/parser/types';
import { expandNiche } from '@/lib/research/expand-niche';
import { indexAuthor } from '@/lib/research/index-author';
import {
  computeReelMetrics,
  computeViralScores,
  type ScoreInput,
} from '@/lib/research/metrics';
import { captionHash, dedupeByCaption } from '@/lib/research/dedupe';
import { getCachedSearch, putCachedSearch, type ResearchFilters } from '@/lib/research/cache';
import { summarizeNiche, type NicheSummary } from '@/lib/research/niche-summary';
import { embedBatch, isEmbeddingsConfigured } from '@/lib/research/embeddings';
import { upsertReels, findDuplicateReelIds, isQdrantConfigured } from '@/lib/research/qdrant';

export const runtime = 'nodejs';
export const maxDuration = 180;

const SortField = z.enum(['viral_score', 'views', 'virality', 'engagement', 'date']).default('viral_score');
const Period = z.enum(['all', '7d', '30d', '90d']).default('all');

const bodySchema = z.object({
  niche: z.string().min(2).max(200),
  // Фильтры (ТЗ §5)
  period: Period.optional(),
  language: z.string().max(10).optional(),
  postType: z.enum(['reel', 'image', 'carousel']).optional(),
  durationBand: z.enum(['short', 'medium', 'long']).nullable().optional(),
  sortBy: SortField.optional(),
  limit: z.number().int().min(1).max(100).default(30),
  // Сколько новых авторов разрешаем индексировать в этом запросе
  // (защита от взрывного потребления Apify-кредитов).
  maxNewAuthors: z.number().int().min(0).max(30).default(10),
  // Принудительно обновить кэш (UI: «Обновить»)
  force: z.boolean().default(false),
});

type ReelRow = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: Date | null;
  virality: number | null;
  engagementRate: number | null;
  velocity: number | null;
  viralScore: number | null;
  reach: number | null;
  captionHash: string | null;
  author: {
    id: string;
    username: string;
    followers: number | null;
    medianViews: number | null;
    avatarUrl: string | null;
  };
};

function periodCutoff(period: ResearchFilters['period']): Date | null {
  switch (period) {
    case '7d': return new Date(Date.now() - 7 * 86_400_000);
    case '30d': return new Date(Date.now() - 30 * 86_400_000);
    case '90d': return new Date(Date.now() - 90 * 86_400_000);
    default: return null;
  }
}

function sortReels(reels: ReelRow[], sortBy: z.infer<typeof SortField>): ReelRow[] {
  const cmp = (a: ReelRow, b: ReelRow): number => {
    switch (sortBy) {
      case 'views': return (b.views || 0) - (a.views || 0);
      case 'virality': return (b.virality || 0) - (a.virality || 0);
      case 'engagement': return (b.engagementRate || 0) - (a.engagementRate || 0);
      case 'date': {
        const da = a.postedAt?.getTime() || 0;
        const db = b.postedAt?.getTime() || 0;
        return db - da;
      }
      default: return (b.viralScore || 0) - (a.viralScore || 0);
    }
  };
  return [...reels].sort(cmp);
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  if (!isApifyConfigured()) {
    return NextResponse.json(
      { error: 'apify_not_configured', message: 'APIFY_TOKEN не задан в окружении сервера.' },
      { status: 503 },
    );
  }

  const filtersForCache: ResearchFilters = {
    period: body.period,
    language: body.language,
    postType: body.postType,
    durationBand: body.durationBand ?? null,
  };

  // 1. Проверка кэша — если есть и не force, отдаём.
  if (!body.force) {
    const cached = await getCachedSearch(body.niche, filtersForCache);
    if (cached && cached.resultReelIds.length > 0) {
      const reels = await prisma.researchReel.findMany({
        where: { id: { in: cached.resultReelIds } },
        include: { author: true },
      });
      // Восстанавливаем порядок из cache.resultReelIds
      const byId = new Map(reels.map((r) => [r.id, r]));
      const ordered = cached.resultReelIds
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      const sorted = sortReels(ordered.map(toReelRow), body.sortBy || 'viral_score').slice(0, body.limit);
      const expansion = (cached.expansion as { keywords?: string[]; hashtags?: string[] } | null) || null;

      await prisma.researchSearch.create({
        data: {
          userId: user.id,
          niche: body.niche,
          filters: filtersForCache as object,
          resultReelIds: sorted.map((r) => r.id),
          summary: cached.summary,
          cacheHit: true,
          durationMs: Date.now() - started,
        },
      });

      return NextResponse.json({
        ok: true,
        cacheHit: true,
        niche: body.niche,
        keywords: expansion?.keywords || [],
        hashtags: expansion?.hashtags || [],
        summary: cached.summary,
        reels: sorted,
      });
    }
  }

  // 2. Расширение ниши через Claude
  const expansion = await expandNiche(body.niche);

  // 3. Apify hashtag-search в параллель. Если Claude не вернул хэштеги
  // (или нет ключа) — используем нишу как один тег.
  const tagsToScrape = expansion.hashtags.length > 0
    ? expansion.hashtags
    : [body.niche.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()].filter(Boolean);

  const errors: string[] = [];
  const allItems: ApifyItem[] = [];
  const settled = await Promise.allSettled(
    tagsToScrape.map((tag) =>
      guardedScrapeHashtag(tag, { days: 30, limit: 25 }).then((r) => ({ tag, r })),
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

  // 4. Классифицируем и берём только рилсы (etap 1 — только Reels по ТЗ §15.1)
  const cls = classify(allItems);
  const candidates: ScoredPost[] = cls.reels;

  // Уникальные авторы из выдачи → индексируем (до maxNewAuthors)
  const uniqueOwners = Array.from(
    new Set(candidates.map((c) => c.owner?.toLowerCase()).filter((o): o is string => Boolean(o))),
  );

  // Существующие записи — чтобы не считать их «новыми»
  const existing = await prisma.researchAuthor.findMany({
    where: { platform: 'instagram', username: { in: uniqueOwners } },
    select: { username: true, lastIndexedAt: true, medianViews: true, followers: true, id: true },
  });
  const existingMap = new Map(existing.map((a) => [a.username, a]));

  const needsIndexing = uniqueOwners.filter((u) => !existingMap.get(u));
  const toIndex = needsIndexing.slice(0, body.maxNewAuthors);
  const indexResults = await Promise.allSettled(toIndex.map((u) => indexAuthor(u)));
  for (const r of indexResults) {
    if (r.status === 'rejected') errors.push(`index: ${String(r.reason).slice(0, 200)}`);
  }

  // Перечитаем авторов уже с медианой
  const allAuthors = await prisma.researchAuthor.findMany({
    where: { platform: 'instagram', username: { in: uniqueOwners } },
  });
  const authorByName = new Map(allAuthors.map((a) => [a.username, a]));

  // 5. Считаем per-reel метрики и пишем ResearchReel'ы по выдаче.
  // viralScore считаем относительно ТЕКУЩЕЙ выборки (перцентильно).
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

  // Upsert рилсов из выдачи. Если рилс уже есть (например, в результате
  // индексации автора) — обновим метрики.
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

  // 6. Перечитаем уже сохранённые рилсы с фильтрами периода/типа и
  // применим финальную сортировку. Делаем это через БД, чтобы кэш
  // в следующий раз отдавал ровно тот же набор.
  const cutoff = periodCutoff(body.period);
  const whereClause: Record<string, unknown> = {
    platform: 'instagram',
    authorId: { in: Array.from(authorByName.values()).map((a) => a.id) },
    externalId: { in: enriched.map((e) => e.c.shortcode!) },
  };
  if (cutoff) whereClause.postedAt = { gte: cutoff };
  if (body.postType) whereClause.postType = body.postType;

  const dbReels = await prisma.researchReel.findMany({
    where: whereClause,
    include: { author: true },
  });

  let rows = dbReels.map(toReelRow);
  // Стадия 1: дешёвый дедуп по captionHash — отсекает прямые копии текста.
  rows = dedupeByCaption(rows);

  // Стадия 2: семантический дедуп через Voyage + Qdrant (ТЗ §3/§4).
  // Если эмбеддинги или Qdrant не настроены — пропускаем, остаёмся
  // с captionHash-дедупом.
  if (isEmbeddingsConfigured() && isQdrantConfigured() && rows.length > 0) {
    const texts = rows.map((r) => (r.caption || '').slice(0, 1000));
    const vectors = await embedBatch(texts);

    // upsert ДО search — чтобы рилсы из батча были видны друг другу.
    const pointsToUpsert = rows
      .map((r, i) => {
        const v = vectors[i];
        if (!v) return null;
        return {
          id: r.id,
          vector: v,
          payload: {
            reelId: r.id,
            authorUsername: r.author.username,
            viralScore: r.viralScore,
            virality: r.virality,
            postedAt: r.postedAt ? r.postedAt.toISOString() : null,
          },
        };
      })
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (pointsToUpsert.length > 0) {
      await upsertReels(pointsToUpsert);
    }

    const dupeIds = await findDuplicateReelIds(
      rows
        .map((r, i) => {
          const v = vectors[i];
          if (!v) return null;
          return { reelId: r.id, vector: v, viralScore: r.viralScore };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    );
    if (dupeIds.size > 0) {
      rows = rows.filter((r) => !dupeIds.has(r.id));
    }
  }

  rows = sortReels(rows, body.sortBy || 'viral_score').slice(0, body.limit);

  // 6.5. Niche-aggregate summary (Модуль 4). Только если рилсов
  // достаточно — иначе шумно. Не блокируем основную отдачу: если
  // summarizeNiche упал, просто возвращаем без summary.
  let nicheSummary: NicheSummary | null = null;
  if (rows.length >= 5) {
    const summaryRes = await summarizeNiche({
      niche: body.niche,
      reels: rows.map((r) => ({
        id: r.id,
        views: r.views,
        virality: r.virality,
        engagement: r.engagementRate,
        duration: null,
        caption: r.caption || '',
      })),
    });
    if (summaryRes.ok) nicheSummary = summaryRes.data;
  }

  // 7. Кэш + журнал
  await putCachedSearch({
    niche: body.niche,
    filters: filtersForCache,
    resultReelIds: rows.map((r) => r.id),
    summary: nicheSummary?.summary ?? null,
    expansion: { keywords: expansion.keywords, hashtags: expansion.hashtags },
  });

  await prisma.researchSearch.create({
    data: {
      userId: user.id,
      niche: body.niche,
      filters: filtersForCache as object,
      resultReelIds: rows.map((r) => r.id),
      cacheHit: false,
      durationMs: Date.now() - started,
    },
  });

  return NextResponse.json({
    ok: true,
    cacheHit: false,
    niche: body.niche,
    keywords: expansion.keywords,
    hashtags: expansion.hashtags,
    summary: nicheSummary?.summary ?? null,
    nicheSummary,
    reels: rows,
    stats: {
      scraped: allItems.length,
      candidates: candidates.length,
      indexed: indexResults.length,
      authors: allAuthors.length,
      durationMs: Date.now() - started,
    },
    errors: errors.slice(0, 5),
  });
}

function toReelRow(r: {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  captionHash: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: Date | null;
  virality: number | null;
  engagementRate: number | null;
  velocity: number | null;
  viralScore: number | null;
  reach: number | null;
  author: {
    id: string;
    username: string;
    followers: number | null;
    medianViews: number | null;
    avatarUrl: string | null;
  };
}): ReelRow {
  return {
    id: r.id,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl,
    caption: r.caption,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    postedAt: r.postedAt,
    virality: r.virality,
    engagementRate: r.engagementRate,
    velocity: r.velocity,
    viralScore: r.viralScore,
    reach: r.reach,
    captionHash: r.captionHash,
    author: {
      id: r.author.id,
      username: r.author.username,
      followers: r.author.followers,
      medianViews: r.author.medianViews,
      avatarUrl: r.author.avatarUrl,
    },
  };
}
