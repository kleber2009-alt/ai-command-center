// Apify Instagram scraper. Порт с apps/infra-worker/lib/apify.js на TS.
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
  const token = env.APIFY_TOKEN;
  if (!token) return { ok: false, error: 'APIFY_TOKEN missing' };
  const actor = env.APIFY_INSTAGRAM_ACTOR;
  const timeoutMs = env.APIFY_TIMEOUT_MS;
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
