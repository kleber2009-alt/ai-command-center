// ═══════════════════════════════════════════════════════════════════
// lib/scoring.js — классификация и ранжирование постов из Apify
// ───────────────────────────────────────────────────────────────────
// На вход — сырые items от actor'a apify/instagram-scraper.
// На выход — два массива нормализованных постов, отсортированных
// по velocity-score (descending).
//
//   classify()  → { reels: Post[], carousels: Post[] }
//   rankReels(posts, n)       → top-N reels
//   rankCarousels(posts, n)   → top-N carousels
// ═══════════════════════════════════════════════════════════════════

const MIN_HOURS = 1;          // защита от деления на 0 для свежих постов
const COMMENT_WEIGHT = 3;     // комментарий ≈ 3 лайка по «глубине вовлечения»

/**
 * Преобразовать raw Apify-item в плоский Post.
 * @returns {Post|null} — null если пост явно мусорный (нет id/url/timestamp).
 */
function normalize(item) {
  if (!item) return null;
  // Apify актор иногда возвращает не пост, а ошибку для конкретного источника
  // (handle не существует / приватный / rate-limited / hashtag-режим сломан).
  if (item.error || item.errorDescription) {
    try {
      console.log(`[scoring] apify-error: ${String(item.errorDescription || item.error).slice(0, 240)}`);
    } catch (_) {}
    return null;
  }
  // Apify менял названия полей несколько раз — пробуем все встречавшиеся.
  const shortcode = item.shortCode || item.shortcode || item.code || null;
  const url = item.url || item.permalink || item.postUrl
    || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : null);
  if (!url) {
    try {
      console.log(`[scoring] reject no-url keys=${Object.keys(item).slice(0,25).join(',')}`);
    } catch (_) {}
    return null;
  }

  const tsRaw = item.timestamp || item.takenAtTimestamp || item.taken_at_timestamp || item.takenAt || item.posted_at || null;
  // takenAtTimestamp у Apify иногда unix-секунды как число; пробуем оба пути.
  let postedAtMs = null;
  if (typeof tsRaw === 'number') {
    postedAtMs = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;     // секунды → ms
  } else if (typeof tsRaw === 'string') {
    postedAtMs = new Date(tsRaw).getTime();
  }
  if (!postedAtMs || Number.isNaN(postedAtMs)) {
    try {
      console.log(`[scoring] reject no-timestamp url=${url.slice(-60)} ts_raw=${JSON.stringify(tsRaw)} keys=${Object.keys(item).slice(0,25).join(',')}`);
    } catch (_) {}
    return null;
  }

  const ageH = Math.max(MIN_HOURS, (Date.now() - postedAtMs) / 3_600_000);
  const plays = Number(item.videoPlayCount || item.videoViewCount || 0);
  const likes = Number(item.likesCount || 0);
  const comments = Number(item.commentsCount || 0);
  const engagement = likes + COMMENT_WEIGHT * comments;

  // Тип поста — Apify за последние месяцы менял поля несколько раз; обрабатываем все варианты:
  //   • productType: 'clips' — рилс (новый формат actor'а)
  //   • type: 'Video' / 'Sidecar' / 'Image' — старый формат actor'а
  //   • __typename: GraphVideo / GraphSidecar / GraphImage — ещё более старый GraphQL формат
  //   • mediaType / media_type: 1=photo, 2=video, 8=sidecar — нативное Instagram-поле
  //   • childPosts / sidecarChildren — массив = карусель
  //   • videoUrl — наличие = видео-контент
  //   • images / displayUrl - картинка
  const productType = String(item.productType || '').toLowerCase();
  const type        = String(item.type || '').toLowerCase();
  const typename    = String(item.__typename || '').toLowerCase();
  const mediaType   = Number(item.mediaType ?? item.media_type ?? 0);
  const hasChildren = Array.isArray(item.childPosts) ? item.childPosts.length > 1
                    : Array.isArray(item.sidecarChildren) ? item.sidecarChildren.length > 1
                    : Array.isArray(item.children) ? item.children.length > 1 : false;
  const hasVideo    = Boolean(item.videoUrl || item.video_url || item.videoUrlBackup);

  let kind;
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
    // Debug: один раз на пачку логируем, какие поля видел actor — поможет понять
    // если Apify снова поменял схему.
    try {
      console.log(`[scoring] unknown item kind, keys=${Object.keys(item).slice(0,20).join(',')} ` +
                  `type=${item.type} productType=${item.productType} __typename=${item.__typename} mediaType=${item.mediaType}`);
    } catch (_) {}
  }

  return {
    url,
    shortcode,
    kind,
    owner: item.ownerUsername || null,
    posted_at: item.timestamp,
    age_hours: Math.round(ageH * 10) / 10,
    plays,
    likes,
    comments,
    engagement,
    caption: (item.caption || '').slice(0, 400),
    // Метрики для ранжирования
    views_per_hour: plays / ageH,
    eng_per_hour: engagement / ageH,
    eng_ratio: plays > 0 ? engagement / plays : 0,
  };
}

/**
 * Дедупликация по url (один и тот же пост может прийти и от username,
 * и от hashtag-источника одновременно).
 */
function dedupe(posts) {
  const seen = new Set();
  const out = [];
  for (const p of posts) {
    if (!p || !p.url) continue;
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    out.push(p);
  }
  return out;
}

/**
 * Расклассифицировать пачку raw items.
 * @param {object[]} items — сырые Apify items
 * @returns {{reels: Post[], carousels: Post[], skipped: number}}
 */
export function classify(items) {
  const all = (items || []).map(normalize).filter(Boolean);
  const uniq = dedupe(all);
  const reels = uniq.filter((p) => p.kind === 'reel');
  const carousels = uniq.filter((p) => p.kind === 'carousel');
  const images = uniq.filter((p) => p.kind === 'image');
  const unknown = uniq.filter((p) => p.kind === 'unknown');

  // Видимая в логах сводка — сразу понятно почему «no reels/carousels»:
  //   classify: in=N uniq=N reels=N carousels=N images=N unknown=N
  try {
    console.log(`[scoring] classify: in=${items?.length || 0} uniq=${uniq.length} ` +
                `reels=${reels.length} carousels=${carousels.length} ` +
                `images=${images.length} unknown=${unknown.length}`);
  } catch (_) {}

  return {
    reels,
    carousels,
    images,
    unknown,
    skipped: (items?.length || 0) - all.length,
  };
}

/**
 * Топ-N рилсов: composite-скор из views/h, eng/h и eng-ratio,
 * каждое поле мин-макс нормализуется внутри пачки.
 */
export function rankReels(reels, n) {
  if (!reels || reels.length === 0) return [];
  const ranked = scoreComposite(reels, [
    { field: 'views_per_hour', weight: 0.55 },
    { field: 'eng_per_hour',   weight: 0.30 },
    { field: 'eng_ratio',      weight: 0.15 },
  ]);
  return ranked.slice(0, n);
}

/**
 * Топ-N каруселей: composite-скор из eng/h и absolute engagement
 * (у каруселей нет play_count, поэтому velocity = eng/h).
 */
export function rankCarousels(carousels, n) {
  if (!carousels || carousels.length === 0) return [];
  const ranked = scoreComposite(carousels, [
    { field: 'eng_per_hour', weight: 0.70 },
    { field: 'engagement',   weight: 0.30 },
  ]);
  return ranked.slice(0, n);
}

function scoreComposite(posts, factors) {
  const stats = {};
  for (const f of factors) {
    const values = posts.map((p) => Number(p[f.field]) || 0);
    stats[f.field] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return posts
    .map((p) => {
      let score = 0;
      for (const f of factors) {
        const { min, max } = stats[f.field];
        const v = Number(p[f.field]) || 0;
        const norm = max === min ? 0 : (v - min) / (max - min);
        score += norm * f.weight;
      }
      return { ...p, velocity_score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.velocity_score - a.velocity_score);
}
