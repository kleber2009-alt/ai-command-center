// Apify-backed Instagram extractor. Use this instead of personal cookies
// + yt-dlp when you want to avoid sending requests from your own IG
// session / IP. Apify runs its own pool of accounts and residential
// proxies for ~$0.40 per 1000 reels.
//
// Set APIFY_API_TOKEN to enable. Optionally override the actor with
// APIFY_INSTAGRAM_ACTOR (default: apify~instagram-scraper).

export class ApifyError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApifyError'
  }
}

export type ApifyMediaResult = {
  url: string
  title?: string | null
  duration?: number | null
}

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN)
}

// Picks the first non-empty video URL from a heterogeneous Apify result
// item. Different actors expose slightly different field names.
function pickVideoUrl(item: any): string | null {
  const candidates: Array<string | undefined> = [
    item?.videoUrl,
    item?.videoUrlBackup,
    item?.videoUrls?.[0],
    item?.video_versions?.[0]?.url,
    item?.media?.video_versions?.[0]?.url,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c
  }
  return null
}

function pickDuration(item: any): number | null {
  const candidates = [item?.videoDuration, item?.duration, item?.video_duration]
  for (const c of candidates) {
    if (typeof c === 'number' && c > 0) return c
  }
  return null
}

function pickTitle(item: any): string | null {
  const c = item?.caption ?? item?.title ?? item?.text
  return typeof c === 'string' ? c.split('\n')[0].slice(0, 120) : null
}

export async function fetchInstagramViaApify(url: string): Promise<ApifyMediaResult> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    throw new ApifyError(503, 'APIFY_API_TOKEN не настроен')
  }
  // Default to the most popular community Instagram scraper actor.
  const actor = (process.env.APIFY_INSTAGRAM_ACTOR ?? 'apify~instagram-scraper').replace('/', '~')

  let res: Response
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [url],
          resultsType: 'posts',
          resultsLimit: 1,
          addParentData: false,
          proxy: { useApifyProxy: true },
        }),
      },
    )
  } catch (e: any) {
    throw new ApifyError(502, `Не достучаться до Apify: ${e?.message ?? 'fetch failed'}`)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new ApifyError(res.status, `Apify ${res.status}: ${text.slice(0, 250)}`)
  }

  const items = (await res.json()) as any[]
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApifyError(404, 'Apify вернул пустой dataset')
  }

  const item = items[0]
  const videoUrl = pickVideoUrl(item)
  if (!videoUrl) {
    throw new ApifyError(404, 'В результате Apify нет видеоссылки (приватный пост?)')
  }

  return {
    url: videoUrl,
    title: pickTitle(item),
    duration: pickDuration(item),
  }
}
