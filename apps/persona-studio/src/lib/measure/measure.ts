// Module D · Measure (Мастер-ТЗ §6). Считает твою медиану и твой Xn по
// опубликованным постам и связывает каждый с источником-вдохновением:
// PostTarget → ScheduledPost(videoGenerationId|videoEditId) → Generation →
// Brief → sourceReel. Замыкает петлю Research → … → Measure.

import { prisma } from '@/lib/prisma';

export type MeasurePost = {
  postTargetId: string;
  platform: string;
  channel: string | null;
  permalink: string | null;
  publishedAt: string | null;
  caption: string | null;
  // последние метрики (снимок)
  views: number | null;
  likes: number | null;
  comments: number | null;
  capturedAt: string | null;
  myXn: number | null; // views / твоя медиана
  // источник-вдохновение (если пост вырос из клона)
  source: {
    thumbnailUrl: string | null;
    url: string | null;
    authorUsername: string | null;
    sourceXn: number | null; // virality источника
    briefId: string | null;
    topic: string | null;
  } | null;
};

export type MeasureDashboard = {
  myMedian: number | null;
  publishedCount: number;
  withMetrics: number;
  bestXn: number | null;
  posts: MeasurePost[];
};

function median(nums: number[]): number | null {
  const a = nums.filter((n) => n > 0).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

export async function getMeasureDashboard(userId: string): Promise<MeasureDashboard> {
  const targets = await prisma.postTarget.findMany({
    where: { status: 'published', scheduledPost: { userId } },
    include: {
      scheduledPost: { select: { videoGenerationId: true, videoEditId: true, caption: true } },
      socialAccount: { select: { displayName: true } },
      metrics: { orderBy: { capturedAt: 'desc' }, take: 1 },
    },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });

  // Атрибуция: сопоставляем published-таргеты с Generation по video/edit id.
  const vgIds = [...new Set(targets.map((t) => t.scheduledPost.videoGenerationId).filter(Boolean) as string[])];
  const veIds = [...new Set(targets.map((t) => t.scheduledPost.videoEditId).filter(Boolean) as string[])];

  const generations =
    vgIds.length || veIds.length
      ? await prisma.generation.findMany({
          where: {
            userId,
            OR: [
              vgIds.length ? { videoGenerationId: { in: vgIds } } : undefined,
              veIds.length ? { videoEditId: { in: veIds } } : undefined,
            ].filter(Boolean) as object[],
          },
          select: {
            videoGenerationId: true,
            videoEditId: true,
            brief: {
              select: {
                id: true,
                topic: true,
                sourceReel: {
                  select: {
                    thumbnailUrl: true,
                    url: true,
                    virality: true,
                    author: { select: { username: true } },
                  },
                },
              },
            },
          },
        })
      : [];

  const byVg = new Map<string, (typeof generations)[number]>();
  const byVe = new Map<string, (typeof generations)[number]>();
  for (const g of generations) {
    if (g.videoGenerationId) byVg.set(g.videoGenerationId, g);
    if (g.videoEditId) byVe.set(g.videoEditId, g);
  }

  // Твоя медиана — по последним просмотрам опубликованных постов.
  const latestViews = targets.map((t) => t.metrics[0]?.views ?? 0);
  const myMedian = median(latestViews);

  const posts: MeasurePost[] = targets.map((t) => {
    const m = t.metrics[0] ?? null;
    const views = m?.views ?? null;
    const gen =
      (t.scheduledPost.videoEditId ? byVe.get(t.scheduledPost.videoEditId) : undefined) ??
      (t.scheduledPost.videoGenerationId ? byVg.get(t.scheduledPost.videoGenerationId) : undefined);
    const sr = gen?.brief.sourceReel ?? null;
    const myXn = views != null && myMedian ? Math.round((views / myMedian) * 10) / 10 : null;
    return {
      postTargetId: t.id,
      platform: t.platform,
      channel: t.socialAccount.displayName ?? null,
      permalink: t.permalink,
      publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
      caption: t.scheduledPost.caption,
      views,
      likes: m?.likes ?? null,
      comments: m?.comments ?? null,
      capturedAt: m ? m.capturedAt.toISOString().slice(0, 10) : null,
      myXn,
      source: gen
        ? {
            thumbnailUrl: sr?.thumbnailUrl ?? null,
            url: sr?.url ?? null,
            authorUsername: sr?.author?.username ?? null,
            sourceXn: sr?.virality ?? null,
            briefId: gen.brief.id,
            topic: gen.brief.topic,
          }
        : null,
    };
  });

  const xns = posts.map((p) => p.myXn).filter((x): x is number => x != null);
  return {
    myMedian,
    publishedCount: targets.length,
    withMetrics: targets.filter((t) => t.metrics.length > 0).length,
    bestXn: xns.length ? Math.max(...xns) : null,
    posts,
  };
}

/** Ручной/коллекторный апсёрт суточного снимка метрик для таргета. */
export async function recordMetric(opts: {
  userId: string;
  postTargetId: string;
  day: Date; // дата снимка (00:00)
  views: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  source?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Проверяем владение таргетом через ScheduledPost.userId.
  const target = await prisma.postTarget.findFirst({
    where: { id: opts.postTargetId, scheduledPost: { userId: opts.userId } },
    select: { id: true },
  });
  if (!target) return { ok: false, error: 'not_found' };

  await prisma.ownPostMetric.upsert({
    where: { postTargetId_capturedAt: { postTargetId: opts.postTargetId, capturedAt: opts.day } },
    create: {
      postTargetId: opts.postTargetId,
      capturedAt: opts.day,
      views: opts.views,
      likes: opts.likes ?? 0,
      comments: opts.comments ?? 0,
      saves: opts.saves ?? 0,
      shares: opts.shares ?? 0,
      source: opts.source ?? 'manual',
    },
    update: {
      views: opts.views,
      likes: opts.likes ?? 0,
      comments: opts.comments ?? 0,
      saves: opts.saves ?? 0,
      shares: opts.shares ?? 0,
      source: opts.source ?? 'manual',
    },
  });
  return { ok: true };
}
