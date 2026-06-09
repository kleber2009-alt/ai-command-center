// ═══════════════════════════════════════════════════════════════════
// lib/apify.js — поиск «залетевшего» рилса у конкурента через Apify
// ───────────────────────────────────────────────────────────────────
// Использует public actor `apify/instagram-scraper` в sync-режиме:
// один POST → ждём ответа с массивом постов. Выбираем недавний
// (≤ APIFY_LOOKBACK_DAYS) рилс с максимальным play_count.
//
// Если APIFY_TOKEN не задан — research-стадия требует прямой
// source_url в payload; иначе handler упадёт с понятной ошибкой.
//
// docs: https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items
// ═══════════════════════════════════════════════════════════════════

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const ACTOR_ID = process.env.APIFY_INSTAGRAM_ACTOR || 'apify~instagram-scraper';
const LOOKBACK_DAYS = parseInt(process.env.APIFY_LOOKBACK_DAYS || '30', 10);
const RESULTS_LIMIT = parseInt(process.env.APIFY_RESULTS_LIMIT || '30', 10);
const TIMEOUT_MS = parseInt(process.env.APIFY_TIMEOUT_MS || '60000', 10);

export function isApifyConfigured() {
  return Boolean(APIFY_TOKEN);
}

/**
 * Достать прямой CDN URL для конкретного Instagram-рилса.
 * Используется как обход yt-dlp/Instagram login-wall: Apify-скрейпер
 * возвращает короткоживущий videoUrl на graph-CDN, который мы качаем
 * обычным fetch'ем.
 *
 * @param {string} url — instagram.com/reel(s)/<shortcode>/ или /p/<sc>/
 * @returns {Promise<{ok:true, videoUrl:string, metadata:object} | {ok:false, error:string}>}
 */
export async function getInstagramDirect(url) {
  if (!APIFY_TOKEN) return { ok: false, error: 'APIFY_TOKEN missing' };
  if (!url) return { ok: false, error: 'url required' };

  const apiUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&timeout=${Math.floor(TIMEOUT_MS / 1000)}`;

  const body = {
    directUrls: [url],
    resultsType: 'details',
    resultsLimit: 1,
  };

  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS + 5000),
    });
  } catch (e) {
    return { ok: false, error: `apify direct fetch: ${e.message}` };
  }
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `apify ${res.status}: ${t.slice(0, 300)}` };
  }
  let items;
  try { items = await res.json(); } catch (e) {
    return { ok: false, error: `apify non-json: ${e.message}` };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'apify returned no items for url' };
  }
  const top = items[0];
  const videoUrl = top.videoUrl || top.video_url || null;
  if (!videoUrl) return { ok: false, error: `apify item has no videoUrl (keys: ${Object.keys(top).slice(0, 8).join(',')})` };

  return {
    ok: true,
    videoUrl,
    metadata: {
      play_count: top.videoPlayCount || top.videoViewCount || null,
      like_count: top.likesCount || null,
      comments_count: top.commentsCount || null,
      posted_at: top.timestamp || null,
      caption: (top.caption || '').slice(0, 500),
      owner: top.ownerUsername || null,
      duration: top.videoDuration || null,
    },
  };
}

// ───────────────────────────────────────────────────────────
// Низкоуровневая обёртка над actor'ом instagram-scraper.
// Возвращает сырой массив items (или {ok:false,error}).
// ───────────────────────────────────────────────────────────
async function callScraper(body) {
  if (!APIFY_TOKEN) return { ok: false, error: 'APIFY_TOKEN missing' };
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&timeout=${Math.floor(TIMEOUT_MS / 1000)}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS + 5000),
    });
  } catch (e) {
    return { ok: false, error: `apify fetch: ${e.message}` };
  }
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `apify ${res.status}: ${t.slice(0, 300)}` };
  }
  let items;
  try { items = await res.json(); } catch (e) {
    return { ok: false, error: `apify non-json: ${e.message}` };
  }
  if (!Array.isArray(items)) {
    return { ok: false, error: 'apify returned non-array body' };
  }
  return { ok: true, items };
}

/**
 * Скрейпит посты конкретного аккаунта за последние N дней.
 * Возвращает сырые items от Apify — классификацию reels/carousels
 * и ранжирование делает lib/scoring.js.
 *
 * @param {string} handle — '@expert_account' или 'expert_account'
 * @param {{days?:number, limit?:number}} opts
 * @returns {Promise<{ok:true, items:object[]} | {ok:false, error:string}>}
 */
export async function scrapeAccountPosts(handle, opts = {}) {
  if (!handle) return { ok: false, error: 'handle required' };
  const username = handle.replace(/^@/, '').trim();
  const days = opts.days || LOOKBACK_DAYS;
  const limit = opts.limit || RESULTS_LIMIT;
  // 2026-05-21: actor перестал принимать `username:[...]` (Empty or private data),
  // переключились на directUrls с полным URL профиля — работает стабильно.
  return callScraper({
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    onlyPostsNewerThan: `${days} days`,
  });
}

/**
 * Скрейпит топовые посты по хэштегу за последние N дней.
 *
 * @param {string} tag — '#salescoaching' или 'salescoaching'
 * @param {{days?:number, limit?:number}} opts
 * @returns {Promise<{ok:true, items:object[]} | {ok:false, error:string}>}
 */
export async function scrapeHashtagPosts(tag, opts = {}) {
  if (!tag) return { ok: false, error: 'tag required' };
  const hashtag = tag.replace(/^#/, '').trim();
  const days = opts.days || LOOKBACK_DAYS;
  const limit = opts.limit || RESULTS_LIMIT;
  // 2026-05-21: тот же фикс — directUrls вместо hashtags:[...].
  return callScraper({
    directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    onlyPostsNewerThan: `${days} days`,
  });
}

/**
 * Найти топ-рилс конкурента по play_count за последние N дней.
 * @param {string} handle — например '@expert_account' или 'expert_account'
 * @returns {Promise<{ok:true, url:string, metadata:object} | {ok:false, error:string}>}
 */
export async function findTopViralReel(handle) {
  if (!APIFY_TOKEN) return { ok: false, error: 'APIFY_TOKEN missing' };
  if (!handle) return { ok: false, error: 'handle required' };

  const username = handle.replace(/^@/, '').trim();
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&timeout=${Math.floor(TIMEOUT_MS / 1000)}`;

  const body = {
    // 2026-05-21: см. scrapeAccountPosts — username:[...] перестал работать.
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: 'posts',
    resultsLimit: RESULTS_LIMIT,
    onlyPostsNewerThan: `${LOOKBACK_DAYS} days`,
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS + 5000),
    });
  } catch (e) {
    return { ok: false, error: `apify fetch: ${e.message}` };
  }
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `apify ${res.status}: ${t.slice(0, 300)}` };
  }
  let items;
  try { items = await res.json(); } catch (e) {
    return { ok: false, error: `apify non-json: ${e.message}` };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: `no posts for @${username} in last ${LOOKBACK_DAYS}d` };
  }

  // Берём только видео/рилсы, сортируем по play_count desc, берём первый.
  const reels = items
    .filter((p) => p && (p.type === 'Video' || p.productType === 'clips' || p.videoUrl))
    .sort((a, b) => (b.videoPlayCount || b.videoViewCount || 0) - (a.videoPlayCount || a.videoViewCount || 0));

  if (reels.length === 0) {
    return { ok: false, error: `no video posts for @${username}` };
  }
  const top = reels[0];
  const reelUrl = top.url
    || (top.shortCode ? `https://www.instagram.com/reel/${top.shortCode}/` : null);
  if (!reelUrl) return { ok: false, error: 'apify returned no usable url' };

  return {
    ok: true,
    url: reelUrl,
    metadata: {
      play_count: top.videoPlayCount || top.videoViewCount || null,
      like_count: top.likesCount || null,
      comments_count: top.commentsCount || null,
      posted_at: top.timestamp || null,
      caption: (top.caption || '').slice(0, 500),
      owner: username,
    },
  };
}
