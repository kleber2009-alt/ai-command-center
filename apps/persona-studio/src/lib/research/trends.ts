// Модуль F · Тренды (Мастер-ТЗ §8). Агрегат поверх уже спарсенных данных:
// топ аудио, топ архетипов хуков, растущие форматы/темы по нише за окно 7/30
// дней. Рост = дельта среднего virality / частоты к предыдущему окну.
//
// Отклонение от буквы ТЗ (де-факто архитектура): вместо materialized views
// считаем live-агрегацией Prisma groupBy (+ можно закэшировать). Вывод тот же.

import { prisma } from '@/lib/prisma';

export type TrendWindow = 7 | 30;

export type TrendItem = {
  key: string; // music name | hook formula | postType | tag
  label: string;
  count: number;
  avgVirality: number | null; // средняя виральность в окне
  avgViews: number | null; // для хуков — средние просмотры источника
  deltaPct: number | null; // рост к предыдущему окну (по avgVirality / count)
};

export type TrendsResult = {
  niche: string; // 'all' | конкретный тег
  windowDays: TrendWindow;
  audio: TrendItem[];
  hooks: TrendItem[];
  formats: TrendItem[];
  topics: TrendItem[];
};

const DAY = 86_400_000;
const FORMAT_LABEL: Record<string, string> = {
  reel: 'Reels',
  image: 'Фото-пост',
  carousel: 'Карусель',
};

function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export async function computeTrends(opts: {
  niche: string;
  windowDays: TrendWindow;
  now: number;
}): Promise<TrendsResult> {
  const { niche, windowDays, now } = opts;
  const curStart = new Date(now - windowDays * DAY);
  const prevStart = new Date(now - 2 * windowDays * DAY);
  const prevEnd = curStart;

  const nicheReel = niche && niche !== 'all' ? { nicheTags: { has: niche } } : {};
  const nicheHook = niche && niche !== 'all' ? { niche: { equals: niche } } : {};

  // ── Аудио (group by music) ──
  const [audioCur, audioPrev] = await Promise.all([
    prisma.researchReel.groupBy({
      by: ['music'],
      where: { music: { not: null }, postedAt: { gte: curStart }, ...nicheReel },
      _count: { _all: true },
      _avg: { virality: true },
    }),
    prisma.researchReel.groupBy({
      by: ['music'],
      where: { music: { not: null }, postedAt: { gte: prevStart, lt: prevEnd }, ...nicheReel },
      _avg: { virality: true },
    }),
  ]);
  const audioPrevMap = new Map(audioPrev.map((a) => [a.music ?? '', a._avg.virality]));
  const audio: TrendItem[] = audioCur
    .filter((a) => a.music && a.music.trim() && a._count._all >= 2)
    .map((a) => ({
      key: a.music!,
      label: a.music!,
      count: a._count._all,
      avgVirality: a._avg.virality != null ? Math.round(a._avg.virality * 10) / 10 : null,
      avgViews: null,
      deltaPct: deltaPct(a._avg.virality, audioPrevMap.get(a.music ?? '') ?? null),
    }))
    .sort((x, y) => (y.avgVirality ?? 0) - (x.avgVirality ?? 0))
    .slice(0, 10);

  // ── Форматы (group by postType) ──
  const [fmtCur, fmtPrev] = await Promise.all([
    prisma.researchReel.groupBy({
      by: ['postType'],
      where: { postedAt: { gte: curStart }, ...nicheReel },
      _count: { _all: true },
      _avg: { virality: true },
    }),
    prisma.researchReel.groupBy({
      by: ['postType'],
      where: { postedAt: { gte: prevStart, lt: prevEnd }, ...nicheReel },
      _avg: { virality: true },
    }),
  ]);
  const fmtPrevMap = new Map(fmtPrev.map((f) => [f.postType, f._avg.virality]));
  const formats: TrendItem[] = fmtCur
    .map((f) => ({
      key: f.postType,
      label: FORMAT_LABEL[f.postType] ?? f.postType,
      count: f._count._all,
      avgVirality: f._avg.virality != null ? Math.round(f._avg.virality * 10) / 10 : null,
      avgViews: null,
      deltaPct: deltaPct(f._avg.virality, fmtPrevMap.get(f.postType) ?? null),
    }))
    .sort((x, y) => (y.avgVirality ?? 0) - (x.avgVirality ?? 0));

  // ── Хуки (group by formula, ResearchHook) ──
  const [hookCur, hookPrev] = await Promise.all([
    prisma.researchHook.groupBy({
      by: ['formula'],
      where: { createdAt: { gte: curStart }, ...nicheHook },
      _count: { _all: true },
      _avg: { sourceViews: true },
    }),
    prisma.researchHook.groupBy({
      by: ['formula'],
      where: { createdAt: { gte: prevStart, lt: prevEnd }, ...nicheHook },
      _count: { _all: true },
    }),
  ]);
  const hookPrevMap = new Map(hookPrev.map((h) => [h.formula, h._count._all]));
  const hooks: TrendItem[] = hookCur
    .map((h) => ({
      key: h.formula,
      label: h.formula,
      count: h._count._all,
      avgVirality: null,
      avgViews: h._avg.sourceViews != null ? Math.round(h._avg.sourceViews) : null,
      deltaPct: deltaPct(h._count._all, hookPrevMap.get(h.formula) ?? null),
    }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);

  // ── Темы (nicheTags — массив, считаем в JS по ограниченной выборке) ──
  const topReels = await prisma.researchReel.findMany({
    where: { postedAt: { gte: curStart }, viralScore: { not: null }, ...nicheReel },
    select: { nicheTags: true, virality: true },
    orderBy: { viralScore: 'desc' },
    take: 400,
  });
  const tagAgg = new Map<string, { count: number; sumV: number; nV: number }>();
  for (const r of topReels) {
    for (const tag of r.nicheTags) {
      if (!tag || (niche !== 'all' && tag === niche)) continue;
      const cur = tagAgg.get(tag) ?? { count: 0, sumV: 0, nV: 0 };
      cur.count += 1;
      if (r.virality != null) {
        cur.sumV += r.virality;
        cur.nV += 1;
      }
      tagAgg.set(tag, cur);
    }
  }
  const topics: TrendItem[] = [...tagAgg.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([tag, v]) => ({
      key: tag,
      label: tag,
      count: v.count,
      avgVirality: v.nV ? Math.round((v.sumV / v.nV) * 10) / 10 : null,
      avgViews: null,
      deltaPct: null,
    }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 12);

  return { niche: niche || 'all', windowDays, audio, hooks, formats, topics };
}

/** Доступные ниша-теги (для селектора) — топ по частоте за 30 дней. */
export async function listNicheTags(opts: { now: number; limit?: number }): Promise<string[]> {
  const since = new Date(opts.now - 30 * DAY);
  const reels = await prisma.researchReel.findMany({
    where: { postedAt: { gte: since } },
    select: { nicheTags: true },
    take: 1000,
    orderBy: { postedAt: 'desc' },
  });
  const counts = new Map<string, number>();
  for (const r of reels) for (const t of r.nicheTags) if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.limit ?? 24)
    .map(([t]) => t);
}
