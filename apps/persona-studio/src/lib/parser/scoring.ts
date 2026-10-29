// Классификация и ранжирование Apify items. Порт с
// apps/infra-worker/lib/scoring.js на TS. На вход — сырые items, на
// выход — нормализованные ScoredPost, отсортированные по velocity_score.

import type { ApifyItem } from './apify';
import type { ScoredPost, PostKind } from './types';

const MIN_HOURS = 1;
const COMMENT_WEIGHT = 3;
// Instagram allows up to 20 slides per carousel; guard against junk payloads.
const MAX_SLIDES = 20;

type ChildLike = {
  displayUrl?: unknown;
  display_url?: unknown;
  imageUrl?: unknown;
  url?: unknown;
  images?: unknown;
};

function firstHttpUrl(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
  }
  return null;
}

/**
 * Carousel slide image URLs in slide order. apify~instagram-scraper gives
 * `childPosts[]` (each with `displayUrl`; a video slide carries its poster in
 * `displayUrl`) and, on most versions, a flat `images[]`. Older payloads use
 * `sidecarChildren` / `children`. We prefer childPosts (true order, one entry
 * per slide), fall back to images[], then to the single displayUrl.
 */
export function extractSlideImages(item: ApifyItem | null | undefined): string[] {
  if (!item) return [];
  const rec = item as Record<string, unknown>;
  const children = [rec.childPosts, rec.sidecarChildren, rec.children].find(
    (c): c is unknown[] => Array.isArray(c) && c.length > 0,
  );
  const out: string[] = [];
  const push = (u: string | null) => {
    if (u && !out.includes(u) && out.length < MAX_SLIDES) out.push(u);
  };
  if (children) {
    for (const ch of children) {
      if (typeof ch === 'string') {
        push(firstHttpUrl(ch));
        continue;
      }
      const c = (ch ?? {}) as ChildLike;
      const imgs = Array.isArray(c.images) ? c.images : [];
      push(firstHttpUrl(c.displayUrl, c.display_url, c.imageUrl, imgs[0], c.url));
    }
  }
  if (out.length === 0 && Array.isArray(rec.images)) {
    for (const u of rec.images) push(firstHttpUrl(u));
  }
  if (out.length === 0) push(firstHttpUrl(rec.displayUrl));
  return out;
}

function normalize(item: ApifyItem | null | undefined): ScoredPost | null {
  if (!item) return null;
  if (item.error || item.errorDescription) return null;

  const shortcode =
    (item.shortCode as string | undefined) ||
    ((item as { shortcode?: string }).shortcode) ||
    ((item as { code?: string }).code) ||
    null;
  const url =
    item.url ||
    ((item as { permalink?: string }).permalink) ||
    ((item as { postUrl?: string }).postUrl) ||
    (shortcode ? `https://www.instagram.com/p/${shortcode}/` : null);
  if (!url) return null;

  const tsRaw =
    item.timestamp ||
    item.takenAtTimestamp ||
    ((item as { taken_at_timestamp?: number }).taken_at_timestamp) ||
    ((item as { takenAt?: string }).takenAt) ||
    ((item as { posted_at?: string }).posted_at) ||
    null;

  let postedAtMs: number | null = null;
  if (typeof tsRaw === 'number') {
    postedAtMs = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
  } else if (typeof tsRaw === 'string') {
    const v = new Date(tsRaw).getTime();
    postedAtMs = Number.isNaN(v) ? null : v;
  }
  if (!postedAtMs) return null;

  const ageH = Math.max(MIN_HOURS, (Date.now() - postedAtMs) / 3_600_000);
  const plays = Number(item.videoPlayCount || item.videoViewCount || 0);
  // Hidden likes come back as -1 from the actor — treat as unknown (0).
  const likes = Math.max(0, Number(item.likesCount || 0));
  const comments = Number(item.commentsCount || 0);
  // Apify не всегда отдаёт shares — пробуем несколько имён полей.
  const shares = Number(
    ((item as { reshareCount?: number }).reshareCount) ||
      ((item as { resharesCount?: number }).resharesCount) ||
      ((item as { shareCount?: number }).shareCount) ||
      ((item as { sharesCount?: number }).sharesCount) ||
      0,
  );
  const engagement = likes + COMMENT_WEIGHT * comments;

  const productType = String(item.productType || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  const typename = String(item.__typename || '').toLowerCase();
  const mediaType = Number(
    item.mediaType ?? ((item as { media_type?: number }).media_type) ?? 0,
  );
  const children =
    (item as { childPosts?: unknown[] }).childPosts ||
    ((item as { sidecarChildren?: unknown[] }).sidecarChildren) ||
    ((item as { children?: unknown[] }).children) ||
    null;
  const hasChildren =
    (Array.isArray(children) && children.length > 1) ||
    (Array.isArray(item.images) && item.images.length > 1);
  const hasVideo = Boolean(
    item.videoUrl ||
      ((item as { video_url?: string }).video_url) ||
      ((item as { videoUrlBackup?: string }).videoUrlBackup),
  );

  let kind: PostKind;
  if (productType === 'clips' || type === 'video' || typename === 'graphvideo' || mediaType === 2) {
    kind = 'reel';
  } else if (type === 'sidecar' || typename === 'graphsidecar' || mediaType === 8 || hasChildren) {
    kind = 'carousel';
  } else if (type === 'image' || typename === 'graphimage' || mediaType === 1) {
    kind = 'image';
  } else if (hasVideo) {
    kind = 'reel';
  } else {
    kind = 'unknown';
  }

  // Thumbnail: для рилсов Apify отдаёт displayUrl, иногда thumbnailUrl,
  // иногда первый кадр из images[].
  const thumbnailUrl =
    ((item as { displayUrl?: string }).displayUrl) ||
    ((item as { thumbnailUrl?: string }).thumbnailUrl) ||
    ((item as { thumbnail_url?: string }).thumbnail_url) ||
    (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null) ||
    null;

  const videoUrl =
    firstHttpUrl(
      item.videoUrl,
      (item as { video_url?: string }).video_url,
      (item as { videoUrlBackup?: string }).videoUrlBackup,
    ) ?? null;
  const fullCaption = typeof item.caption === 'string' ? item.caption : '';

  return {
    url,
    shortcode,
    kind,
    owner: (item.ownerUsername as string | undefined) || null,
    thumbnailUrl,
    // Competitor parser keeps a short caption (Claude rating prompt size);
    // «Мой блог» needs the whole text (code word, structure) → fullCaption.
    caption: fullCaption.slice(0, 400),
    fullCaption,
    postedAtMs,
    ageHours: Math.round(ageH * 10) / 10,
    plays,
    likes,
    comments,
    shares,
    durationSec: Number(item.videoDuration) > 0 ? Math.round(Number(item.videoDuration)) : null,
    engagement,
    viewsPerHour: plays / ageH,
    engPerHour: engagement / ageH,
    engRatio: plays > 0 ? engagement / plays : 0,
    velocityScore: 0,
    videoUrl: kind === 'reel' ? videoUrl : null,
    slideImages: kind === 'carousel' ? extractSlideImages(item) : [],
  };
}

function dedupe(posts: ScoredPost[]): ScoredPost[] {
  const seen = new Set<string>();
  const out: ScoredPost[] = [];
  for (const p of posts) {
    if (!p || !p.url) continue;
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    out.push(p);
  }
  return out;
}

export type ClassifyResult = {
  reels: ScoredPost[];
  carousels: ScoredPost[];
  images: ScoredPost[];
  unknown: ScoredPost[];
  skipped: number;
};

export function classify(items: ApifyItem[] | null | undefined): ClassifyResult {
  const all = (items || []).map(normalize).filter((p): p is ScoredPost => Boolean(p));
  const uniq = dedupe(all);
  return {
    reels: uniq.filter((p) => p.kind === 'reel'),
    carousels: uniq.filter((p) => p.kind === 'carousel'),
    images: uniq.filter((p) => p.kind === 'image'),
    unknown: uniq.filter((p) => p.kind === 'unknown'),
    skipped: (items?.length || 0) - all.length,
  };
}

type Factor = { field: keyof ScoredPost; weight: number };

function scoreComposite(posts: ScoredPost[], factors: Factor[]): ScoredPost[] {
  const stats: Record<string, { min: number; max: number }> = {};
  for (const f of factors) {
    const values = posts.map((p) => Number(p[f.field]) || 0);
    stats[f.field as string] = {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }
  return posts
    .map((p) => {
      let score = 0;
      for (const f of factors) {
        const { min, max } = stats[f.field as string];
        const v = Number(p[f.field]) || 0;
        const norm = max === min ? 0 : (v - min) / (max - min);
        score += norm * f.weight;
      }
      return { ...p, velocityScore: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.velocityScore - a.velocityScore);
}

export function rankReels(reels: ScoredPost[], n: number): ScoredPost[] {
  if (!reels || reels.length === 0) return [];
  return scoreComposite(reels, [
    { field: 'viewsPerHour', weight: 0.55 },
    { field: 'engPerHour', weight: 0.3 },
    { field: 'engRatio', weight: 0.15 },
  ]).slice(0, n);
}

export function rankCarousels(carousels: ScoredPost[], n: number): ScoredPost[] {
  if (!carousels || carousels.length === 0) return [];
  return scoreComposite(carousels, [
    { field: 'engPerHour', weight: 0.7 },
    { field: 'engagement', weight: 0.3 },
  ]).slice(0, n);
}

/**
 * Пороги ДЛЯ РИЛСОВ. У рилсов есть plays — порог по нему обязателен.
 * Shares-порог не применяется к постам с shares === 0 (Apify часто не
 * отдаёт это поле).
 */
export function filterReelsByThresholds(
  reels: ScoredPost[],
  thresholds: { minPlays: number; minLikes: number; minComments: number; minShares: number },
): ScoredPost[] {
  const { minPlays, minLikes, minComments, minShares } = thresholds;
  if (!minPlays && !minLikes && !minComments && !minShares) return reels;
  return reels.filter((p) => {
    const playsOK = p.plays === 0 || p.plays >= minPlays;
    const sharesOK = p.shares === 0 || p.shares >= minShares;
    return playsOK && p.likes >= minLikes && p.comments >= minComments && sharesOK;
  });
}

/**
 * Пороги ДЛЯ КАРУСЕЛЕЙ. У каруселей нет plays и почти никогда нет shares —
 * фильтр только по likes/comments. Дефолтные значения значительно мягче
 * рилсовых, потому что у carousel engagement иначе устроен (читают молча).
 */
export function filterCarouselsByThresholds(
  carousels: ScoredPost[],
  thresholds: { minLikes: number; minComments: number },
): ScoredPost[] {
  const { minLikes, minComments } = thresholds;
  if (!minLikes && !minComments) return carousels;
  return carousels.filter((p) => p.likes >= minLikes && p.comments >= minComments);
}

/** @deprecated — оставлено для совместимости. Используй filterReelsByThresholds. */
export function filterByThresholds(
  posts: ScoredPost[],
  thresholds: { minPlays: number; minLikes: number; minComments: number; minShares: number },
): ScoredPost[] {
  return filterReelsByThresholds(posts, thresholds);
}
