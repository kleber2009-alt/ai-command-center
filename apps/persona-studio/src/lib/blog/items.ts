// «Мой блог»: server-side loader shared by the /blog page (SSR) and
// GET /api/blog/items. Ranks ALL of the owner's stored posts against his own
// medians (so the «лучшее» badge reflects the whole history, not one run).

import { prisma } from '@/lib/prisma';
import {
  daysSince,
  inRemixCooldown,
  rankOwn,
  type OwnKind,
  type OwnMedians,
  type OwnPostInput,
} from './rank';

export type BlogSort = 'score' | 'recent' | 'comments' | 'views' | 'shares' | 'likes';
export const BLOG_SORTS: BlogSort[] = ['score', 'recent', 'comments', 'views', 'shares', 'likes'];

export type BlogItem = {
  id: string;
  kind: OwnKind;
  url: string;
  shortcode: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  durationSec: number | null;
  slideCount: number;
  slideImages: string[];
  postedAt: string | null;
  ageDays: number | null;
  cooldown: boolean;
  score: number;
  rank: number;
  er: number;
  ratios: Record<string, number>;
  best: boolean;
  winner: boolean;
  strongBody: boolean;
  status: string;
  pipelineId: string | null;
};

export type BlogRunInfo = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  postsScanned: number;
  reelsFound: number;
  carouselsFound: number;
  errorMsg: string | null;
};

export type BlogState = {
  handle: string | null;
  lastRun: BlogRunInfo | null;
  medians: Record<OwnKind, OwnMedians>;
  items: BlogItem[];
};

/** Instagram handle from «@nick», «nick» or a profile URL; '' when not parseable. */
export function normalizeHandle(raw: string | null | undefined): string {
  let s = (raw ?? '').trim();
  const m = /instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@+/, '').trim();
  return /^[a-zA-Z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : '';
}

function sortItems(items: BlogItem[], sort: BlogSort): BlogItem[] {
  const by = (f: (x: BlogItem) => number) => [...items].sort((a, b) => f(b) - f(a));
  switch (sort) {
    case 'recent':
      return by((x) => (x.postedAt ? new Date(x.postedAt).getTime() : 0));
    case 'comments':
      return by((x) => x.comments);
    case 'views':
      return by((x) => x.plays);
    case 'shares':
      return by((x) => x.shares);
    case 'likes':
      return by((x) => x.likes);
    default:
      return by((x) => x.score);
  }
}

export async function loadBlogState(
  userId: string,
  opts: { kind?: OwnKind; sort?: BlogSort } = {},
): Promise<BlogState> {
  const [cfg, lastRun, rows] = await Promise.all([
    prisma.parserConfig.findUnique({ where: { userId }, select: { ownHandle: true } }),
    prisma.parserRun.findFirst({ where: { userId, source: 'own' }, orderBy: { startedAt: 'desc' } }),
    prisma.parserItem.findMany({
      where: { userId, source: 'own', status: { not: 'dismissed' }, kind: { in: ['reel', 'carousel'] } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);

  const inputs: OwnPostInput[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as OwnKind,
    plays: r.plays,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    postedAt: r.postedAt,
  }));
  const ranked = rankOwn(inputs);
  const rankById = new Map([...ranked.reel.ranks, ...ranked.carousel.ranks].map((r) => [r.id, r]));

  const pipelines = rows.length
    ? await prisma.pipeline.findMany({
        where: { userId, parserItemId: { in: rows.map((r) => r.id) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, parserItemId: true },
      })
    : [];
  const pipelineByItem = new Map<string, string>();
  for (const p of pipelines) if (p.parserItemId && !pipelineByItem.has(p.parserItemId)) pipelineByItem.set(p.parserItemId, p.id);

  const now = Date.now();
  let items: BlogItem[] = rows.map((r) => {
    const rk = rankById.get(r.id);
    const age = daysSince(r.postedAt, now);
    return {
      id: r.id,
      kind: r.kind as OwnKind,
      url: r.url,
      shortcode: r.shortcode,
      thumbnailUrl: r.thumbnailUrl,
      caption: r.caption,
      plays: r.plays,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      durationSec: r.durationSec,
      slideCount: r.slideImages.length,
      slideImages: r.slideImages,
      postedAt: r.postedAt?.toISOString() ?? null,
      ageDays: age == null ? null : Math.round(age * 10) / 10,
      cooldown: inRemixCooldown(r.postedAt, now),
      score: rk?.score ?? 0,
      rank: rk?.rank ?? 0,
      er: rk?.er ?? 0,
      ratios: (rk?.ratios ?? {}) as Record<string, number>,
      best: rk?.best ?? false,
      winner: rk?.winner ?? false,
      strongBody: rk?.strongBody ?? false,
      status: r.status,
      pipelineId: pipelineByItem.get(r.id) ?? null,
    };
  });
  if (opts.kind) items = items.filter((i) => i.kind === opts.kind);
  items = sortItems(items, opts.sort ?? 'score');

  return {
    handle: cfg?.ownHandle ?? null,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          startedAt: lastRun.startedAt.toISOString(),
          completedAt: lastRun.completedAt?.toISOString() ?? null,
          postsScanned: lastRun.postsScanned,
          reelsFound: lastRun.reelsFound,
          carouselsFound: lastRun.carouselsFound,
          errorMsg: lastRun.errorMsg,
        }
      : null,
    medians: { reel: ranked.reel.medians, carousel: ranked.carousel.medians },
    items,
  };
}
