// Apify Instagram scraper. Порт с services/node/infra-worker/lib/apify.js на TS.
// Используется только сервером (env-зависим). Возвращает СЫРЫЕ items от
// актора — классификацию reels/carousels делает scoring.ts.

import { env } from '@/lib/env';

type ScrapeOk = { ok: true; items: ApifyItem[] };
type ScrapeFail = { ok: false; error: string };
export type ScrapeResult = ScrapeOk | ScrapeFail;

// Сырая форма item от actor'а apify/instagram-scraper. Поля менялись
// несколько раз — scoring.ts знает все варианты.
export type ApifyItem = Record<string, unknown> & {
  url?: string;
  shortCode?: string;
  ownerUsername?: string;
  caption?: string;
  videoUrl?: string;
  videoDuration?: number;   // длительность видео в секундах (Apify reel-scraper)
  videoPlayCount?: number;
  videoViewCount?: number;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  takenAtTimestamp?: number;
  productType?: string;
  type?: string;
  __typename?: string;
  mediaType?: number;
  displayUrl?: string;
  images?: string[];
  error?: string;
  errorDescription?: string;
};

export function isApifyConfigured(): boolean {
  return Boolean(env.APIFY_TOKEN);
}

async function callScraper(body: Record<string, unknown>): Promise<ScrapeResult> {
  return runActor(env.APIFY_INSTAGRAM_ACTOR, body);
}

// Generic Apify actor runner (run-sync-get-dataset-items). Возвращает сырые
// items — маппинг полей под конкретный actor делает вызывающая функция.
async function runActor(
  actorId: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<ScrapeResult> {
  const token = env.APIFY_TOKEN;
  if (!token) return { ok: false, error: 'APIFY_TOKEN missing' };
  const actor = actorId;
  const timeoutMs = opts.timeoutMs || env.APIFY_TIMEOUT_MS;
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token,
  )}&timeout=${Math.floor(timeoutMs / 1000)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });
  } catch (e) {
    return { ok: false, error: `apify fetch: ${(e as Error).message}` };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `apify ${res.status}: ${t.slice(0, 300)}` };
  }
  let items: unknown;
  try {
    items = await res.json();
  } catch (e) {
    return { ok: false, error: `apify non-json: ${(e as Error).message}` };
  }
  if (!Array.isArray(items)) {
    return { ok: false, error: 'apify returned non-array body' };
  }
  return { ok: true, items: items as ApifyItem[] };
}

/**
 * Посты указанного аккаунта за последние N дней. directUrls c полным URL
 * профиля (username:[...] актор перестал принимать в 2026-05).
 */
export async function scrapeAccountPosts(
  handle: string,
  opts: { days?: number; limit?: number } = {},
): Promise<ScrapeResult> {
  if (!handle) return { ok: false, error: 'handle required' };
  const username = handle.replace(/^@/, '').trim();
  const days = opts.days || env.APIFY_LOOKBACK_DAYS;
  const limit = opts.limit || env.APIFY_RESULTS_LIMIT;
  return callScraper({
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    onlyPostsNewerThan: `${days} days`,
  });
}

export function isReelsSearchConfigured(): boolean {
  const actor = env.APIFY_REELS_SEARCH_ACTOR.trim().toLowerCase();
  return Boolean(env.APIFY_TOKEN) && actor !== '' && actor !== 'off';
}

// Сырая форма item от reels-search актора (snake_case, вложенные объекты).
type SearchReelItem = Record<string, unknown> & {
  code?: string;
  id?: string;
  ig_play_count?: number;
  play_count?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  reshare_count?: number;
  video_url?: string;
  video_duration?: number;
  thumbnail_url?: string;
  display_url?: string;
  taken_at_date?: string | number;
  taken_at?: number;
  caption?: { text?: string; hashtags?: string[] } | string | null;
  user?: { username?: string; full_name?: string; follower_count?: number } | null;
  owner?: { username?: string } | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Маппинг reels-search item → ApifyItem (camelCase), чтобы classify/scoring
// работали без изменений. Все элементы — рилсы (productType=clips).
function mapSearchReelToApifyItem(it: SearchReelItem): ApifyItem {
  const code = it.code || (typeof it.id === 'string' ? it.id : undefined);
  const captionText =
    typeof it.caption === 'string' ? it.caption : it.caption?.text || '';
  const username = it.user?.username || it.owner?.username || undefined;
  const ts = it.taken_at_date ?? it.taken_at;
  return {
    code,
    shortCode: code,
    url: code ? `https://www.instagram.com/reel/${code}/` : undefined,
    productType: 'clips',
    type: 'video',
    videoUrl: it.video_url,
    videoDuration: num(it.video_duration) || undefined,
    videoPlayCount: num(it.ig_play_count) || num(it.play_count) || num(it.view_count),
    likesCount: num(it.like_count),
    commentsCount: num(it.comment_count),
    // shares реально приходят от reels-search актора — пробрасываем.
    shareCount: num(it.share_count) || num(it.reshare_count),
    caption: captionText,
    ownerUsername: username,
    timestamp: typeof ts === 'string' ? ts : undefined,
    takenAtTimestamp: typeof ts === 'number' ? ts : undefined,
    thumbnailUrl: it.thumbnail_url || it.display_url,
    displayUrl: it.display_url || it.thumbnail_url,
  } as ApifyItem;
}

/**
 * Поиск рилсов напрямую по ключевому слову (как поиск Reels в IG-приложении).
 * Возвращает items, УЖЕ приведённые к ApifyItem-форме (через mapper), так что
 * их можно скармливать в classify() наравне с хэштег-выдачей.
 */
export async function scrapeSearchReels(
  query: string,
  opts: { maxPages?: number } = {},
): Promise<ScrapeResult> {
  const q = query.trim();
  if (!q) return { ok: false, error: 'query required' };
  if (!isReelsSearchConfigured()) return { ok: false, error: 'reels_search_not_configured' };
  const maxPages = opts.maxPages || env.APIFY_REELS_SEARCH_MAX_PAGES;
  // Длиннее обычного таймаута: у run-sync актора бывает холодный старт,
  // 60с не всегда хватает и вызов рвётся по AbortSignal.
  const r = await runActor(
    env.APIFY_REELS_SEARCH_ACTOR,
    { query: q, maxPages },
    { timeoutMs: env.APIFY_REELS_SEARCH_TIMEOUT_MS },
  );
  if (!r.ok) return r;
  const mapped = r.items.map((it) => mapSearchReelToApifyItem(it as SearchReelItem));
  return { ok: true, items: mapped };
}

/**
 * Топовые посты по хэштегу за последние N дней.
 */
export async function scrapeHashtagPosts(
  tag: string,
  opts: { days?: number; limit?: number } = {},
): Promise<ScrapeResult> {
  if (!tag) return { ok: false, error: 'tag required' };
  const hashtag = tag.replace(/^#/, '').trim();
  const days = opts.days || env.APIFY_LOOKBACK_DAYS;
  const limit = opts.limit || env.APIFY_RESULTS_LIMIT;
  return callScraper({
    directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    onlyPostsNewerThan: `${days} days`,
  });
}
