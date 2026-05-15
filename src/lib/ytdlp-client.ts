// Tiny client for the companion services/ytdlp microservice (Railway/Docker).
// Returns a direct, signed media URL that Deepgram can ingest.

export class YtdlpServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'YtdlpServiceError'
  }
}

export type YtdlpExtractResult = {
  url: string
  title?: string | null
  duration?: number | null
  extractor?: string | null
  ext?: string | null
}

export function isYtdlpServiceConfigured(): boolean {
  return Boolean(process.env.YTDLP_SERVICE_URL)
}

export async function extractDirectMediaUrl(url: string): Promise<YtdlpExtractResult> {
  const base = process.env.YTDLP_SERVICE_URL
  if (!base) {
    throw new YtdlpServiceError(503, 'YTDLP_SERVICE_URL не настроен')
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.YTDLP_SERVICE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.YTDLP_SERVICE_API_KEY}`
  }

  const endpoint = base.replace(/\/$/, '') + '/extract'

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    })
  } catch (e: any) {
    throw new YtdlpServiceError(502, `Не удалось достучаться до yt-dlp сервиса: ${e?.message ?? 'fetch failed'}`)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new YtdlpServiceError(res.status, `yt-dlp (${res.status}): ${text.slice(0, 250)}`)
  }

  const data = (await res.json()) as YtdlpExtractResult
  if (!data?.url) {
    throw new YtdlpServiceError(500, 'yt-dlp сервис вернул пустой URL')
  }
  return data
}

// Recognised social URLs that always need the yt-dlp downloader because
// the page is HTML, not a direct media file.
const SOCIAL_URL_RE =
  /(?:^|\/\/[^/]*\b)(?:instagram\.com|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|x\.com|twitter\.com|facebook\.com|fb\.watch|vimeo\.com|soundcloud\.com)\b/i

export function isSocialMediaUrl(url: string): boolean {
  return SOCIAL_URL_RE.test(url)
}
