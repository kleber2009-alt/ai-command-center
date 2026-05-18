// Client for Apify's apify/instagram-scraper actor. Returns the direct
// media URL of an Instagram Reel / video post that Deepgram can ingest.
// Used instead of yt-dlp + cookies for Instagram so our IG account and
// server IP never appear in any request to instagram.com.

export class ApifyServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApifyServiceError'
  }
}

export type ApifyExtractResult = {
  url: string
  title?: string | null
  duration?: number | null
}

const INSTAGRAM_URL_RE =
  /(?:^|\/\/[^/]*\b)(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\//i

export function isInstagramUrl(url: string): boolean {
  return INSTAGRAM_URL_RE.test(url)
}

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN)
}

// Apify item shape we care about. The actor returns many more fields
// (caption, viewCount, owner, etc.) but we only need the media URL,
// duration and a usable title for history rows.
type ApifyItem = {
  videoUrl?: string | null
  videoDuration?: number | null
  caption?: string | null
  shortCode?: string | null
  type?: string | null
  url?: string | null
}

export async function extractInstagramMediaUrl(url: string): Promise<ApifyExtractResult> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    throw new ApifyServiceError(503, 'APIFY_API_TOKEN не настроен')
  }

  // run-sync-get-dataset-items blocks until the run finishes and returns
  // the items inline. Single-URL runs typically take 5-20 seconds.
  const endpoint =
    'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items' +
    `?token=${encodeURIComponent(token)}`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [url],
        resultsType: 'details',
        resultsLimit: 1,
        addParentData: false,
      }),
    })
  } catch (e: any) {
    throw new ApifyServiceError(502, `Не удалось достучаться до Apify: ${e?.message ?? 'fetch failed'}`)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new ApifyServiceError(res.status, `Apify (${res.status}): ${text.slice(0, 250)}`)
  }

  let items: ApifyItem[]
  try {
    items = (await res.json()) as ApifyItem[]
  } catch {
    throw new ApifyServiceError(500, 'Apify вернул некорректный JSON')
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApifyServiceError(404, 'Apify не нашёл медиа по этой ссылке (приватный/удалённый пост?)')
  }

  const item = items[0]
  if (!item.videoUrl) {
    throw new ApifyServiceError(415, 'Пост не содержит видео (фото-пост или карусель без видео)')
  }

  const titleFromCaption = item.caption
    ? item.caption.trim().slice(0, 80).replace(/\s+/g, ' ')
    : null

  return {
    url: item.videoUrl,
    title: titleFromCaption,
    duration: typeof item.videoDuration === 'number' ? item.videoDuration : null,
  }
}
