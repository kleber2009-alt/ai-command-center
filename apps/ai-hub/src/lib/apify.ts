// Apify Instagram-scraper wrapper. Same shape/pattern as office-worker/lib/apify.js,
// rewritten in TS for ai-hub-worker's job runner.
//
// Docs: https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items

const ACTOR = process.env.APIFY_INSTAGRAM_ACTOR ?? "apify~instagram-scraper";
const TIMEOUT_MS = Number(process.env.APIFY_TIMEOUT_MS ?? 90_000);

export interface IgPost {
  id?: string;
  shortCode?: string;
  url?: string;
  type?: string;                         // "Video" / "Image" / "Sidecar" (carousel)
  productType?: string;                  // "clips" = reel, "feed" = post
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  videoDuration?: number;
  timestamp?: string;
  ownerUsername?: string;
  displayUrl?: string;
  videoUrl?: string;
  hashtags?: string[];
  mentions?: string[];
}

export async function scrapeAccountPosts(handle: string, opts: { days?: number; limit?: number } = {}):
  Promise<{ ok: true; items: IgPost[] } | { ok: false; error: string }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { ok: false, error: "APIFY_TOKEN missing" };

  const username = handle.replace(/^@/, "").trim();
  if (!username) return { ok: false, error: "username required" };

  const days  = opts.days  ?? 30;
  const limit = opts.limit ?? 12;

  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${Math.floor(TIMEOUT_MS / 1000)}`;
  const body = {
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: "posts" as const,
    resultsLimit: limit,
    onlyPostsNewerThan: `${days} days`,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS + 5000),
    });
  } catch (e) {
    return { ok: false, error: `apify fetch: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `apify ${res.status}: ${t.slice(0, 300)}` };
  }
  let items: unknown;
  try { items = await res.json(); }
  catch (e) { return { ok: false, error: `apify non-json: ${e instanceof Error ? e.message : String(e)}` }; }
  if (!Array.isArray(items)) return { ok: false, error: "apify returned non-array body" };
  return { ok: true, items: items as IgPost[] };
}
