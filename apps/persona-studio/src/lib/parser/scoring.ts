// Классификация и ранжирование Apify items. Порт с
// apps/infra-worker/lib/scoring.js на TS. На вход — сырые items, на
// выход — нормализованные ScoredPost, отсортированные по velocity_score.

import type { ApifyItem } from './apify';
import type { ScoredPost, PostKind } from './types';

const MIN_HOURS = 1;
const COMMENT_WEIGHT = 3;

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
  const likes = Number(item.likesCount || 0);
  const comments = Number(item.commentsCount || 0);
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
  const hasChildren = Array.isArray(children) ? children.length > 1 : false;
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

  return {
    url,
    shortcode,
    kind,
    owner: (item.ownerUsername as string | undefined) || null,
    thumbnailUrl,
    caption: (item.caption || '').slice(0, 400),
    postedAtMs,
    ageHours: Math.round(ageH * 10) / 10,
    plays,
    likes,
    comments,
    engagement,
    viewsPerHour: plays / ageH,
    engPerHour: engagement / ageH,
    engRatio: plays > 0 ? engagement / plays : 0,
    velocityScore: 0,
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
 * Применить абсолютные пороги к постам ДО классификации. Carousels/images
 * пропускают plays-порог если plays === 0 (у них нет play_count).
 */
export function filterByThresholds(
  posts: ScoredPost[],
  thresholds: { minPlays: number; minLikes: number; minComments: number },
): ScoredPost[] {
  const { minPlays, minLikes, minComments } = thresholds;
  if (!minPlays && !minLikes && !minComments) return posts;
  return posts.filter((p) => {
    const hasPlays = p.plays > 0;
    const playsOK = !hasPlays || p.plays >= minPlays;
    return playsOK && p.likes >= minLikes && p.comments >= minComments;
  });
}
