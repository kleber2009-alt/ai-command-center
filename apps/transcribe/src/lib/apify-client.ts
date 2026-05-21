// Client for Apify's apify/instagram-scraper actor.
// Used instead of yt-dlp + cookies for Instagram so our IG account and
// server IP never appear in any request to instagram.com.
//
// Two modes:
//   extractInstagramMediaUrl() — single Reel URL → videoUrl for Deepgram
//   scrapeInstagramAccount()   — username → account info + list of Reels
//   scrapeInstagramAccounts()  — multiple usernames → flat Reels array

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

// ─── Types ───────────────────────────────────────────────────────────────────

// Minimal shape for extractInstagramMediaUrl (single Reel → transcription)
type ApifyItem = {
  videoUrl?: string | null
  videoDuration?: number | null
  caption?: string | null
  shortCode?: string | null
  type?: string | null
  url?: string | null
}

// Full shape returned when scraping an account's Reels
export type ApifyReelItem = {
  shortCode: string
  url: string
  displayUrl?: string | null       // thumbnail
  videoUrl?: string | null
  videoDuration?: number | null
  caption?: string | null
  hashtags?: string[] | null
  timestamp?: string | null        // ISO date
  likesCount?: number | null
  commentsCount?: number | null
  videoViewCount?: number | null
  musicInfo?: { songName?: string | null; artistName?: string | null } | null
  // owner info (present when addParentData=true)
  ownerUsername?: string | null
  ownerFullName?: string | null
  ownerBio?: string | null
  ownerFollowersCount?: number | null
  ownerFollowingCount?: number | null
  ownerPostsCount?: number | null
  ownerProfilePicUrl?: string | null
  ownerIsVerified?: boolean | null
}

export type ApifyAccountInfo = {
  username: string
  fullName?: string | null
  bio?: string | null
  followersCount?: number | null
  followingCount?: number | null
  postsCount?: number | null
  profilePicUrl?: string | null
  isVerified?: boolean | null
}

const APIFY_ENDPOINT =
  'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items'

export async function extractInstagramMediaUrl(url: string): Promise<ApifyExtractResult> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    throw new ApifyServiceError(503, 'APIFY_API_TOKEN не настроен')
  }

  // run-sync-get-dataset-items blocks until the run finishes and returns
  // the items inline. Single-URL runs typically take 5-20 seconds.
  const endpoint = APIFY_ENDPOINT + `?token=${encodeURIComponent(token)}`

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

// ─── Account scraping ─────────────────────────────────────────────────────────

async function apifyPost(body: object, timeoutMs = 120_000): Promise<unknown[]> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new ApifyServiceError(503, 'APIFY_API_TOKEN не настроен')

  const endpoint = APIFY_ENDPOINT + `?token=${encodeURIComponent(token)}`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e: any) {
    throw new ApifyServiceError(502, `Apify недоступен: ${e?.message ?? 'fetch failed'}`)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new ApifyServiceError(res.status, `Apify (${res.status}): ${text.slice(0, 250)}`)
  }

  let items: unknown[]
  try {
    items = await res.json()
  } catch {
    throw new ApifyServiceError(500, 'Apify вернул некорректный JSON')
  }

  if (!Array.isArray(items)) throw new ApifyServiceError(500, 'Apify вернул не массив')
  return items
}

function normalizeReel(raw: any): ApifyReelItem | null {
  const shortCode = raw.shortCode ?? raw.shortcode ?? raw.id
  if (!shortCode) return null
  const url = raw.url ?? raw.permalinkUrl ?? `https://www.instagram.com/reel/${shortCode}/`
  return {
    shortCode,
    url,
    displayUrl: raw.displayUrl ?? raw.thumbnailUrl ?? null,
    videoUrl: raw.videoUrl ?? null,
    videoDuration: raw.videoDuration ?? raw.duration ?? null,
    caption: raw.caption ?? null,
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags : null,
    timestamp: raw.timestamp ?? raw.takenAtTimestamp ?? null,
    likesCount: raw.likesCount ?? raw.likeCount ?? null,
    commentsCount: raw.commentsCount ?? raw.commentCount ?? null,
    videoViewCount: raw.videoViewCount ?? raw.viewsCount ?? raw.playCount ?? null,
    musicInfo: raw.musicInfo ?? raw.audioTracks?.[0] ?? null,
    // Apify returns owner fields both as flat (ownerUsername) and profile-page flat (username)
    ownerUsername: raw.ownerUsername ?? raw.username ?? raw.owner?.username ?? null,
    ownerFullName: raw.ownerFullName ?? raw.fullName ?? raw.owner?.fullName ?? null,
    ownerBio: raw.ownerBio ?? raw.biography ?? raw.owner?.biography ?? null,
    ownerFollowersCount: raw.ownerFollowersCount ?? raw.followersCount ?? raw.owner?.followersCount ?? null,
    ownerFollowingCount: raw.ownerFollowingCount ?? raw.followsCount ?? raw.owner?.followingCount ?? null,
    ownerPostsCount: raw.ownerPostsCount ?? raw.postsCount ?? raw.owner?.postsCount ?? null,
    ownerProfilePicUrl: raw.ownerProfilePicUrl ?? raw.profilePicUrl ?? raw.owner?.profilePicUrl ?? null,
    ownerIsVerified: raw.ownerIsVerified ?? raw.verified ?? raw.owner?.verified ?? null,
  }
}

export async function scrapeInstagramAccount(
  username: string,
  limit = 30,
): Promise<{ account: ApifyAccountInfo; reels: ApifyReelItem[]; rawCount: number; rawSample: string }> {
  const items = await apifyPost({
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    addParentData: true,
  }, 180_000)

  const rawCount = items.length
  const rawSample = rawCount > 0
    ? JSON.stringify(Object.keys((items[0] as any) ?? {})).slice(0, 200)
    : '[]'

  const reels: ApifyReelItem[] = []
  let account: ApifyAccountInfo = { username }

  for (const raw of items as any[]) {
    // Extract account info from first item — Apify flattens profile fields into each post
    if (!account.fullName && (raw.username || raw.ownerUsername)) {
      account = {
        username: raw.username ?? raw.ownerUsername ?? username,
        fullName: raw.fullName ?? raw.ownerFullName ?? null,
        bio: raw.biography ?? raw.ownerBio ?? null,
        followersCount: raw.followersCount ?? raw.ownerFollowersCount ?? null,
        followingCount: raw.followsCount ?? raw.ownerFollowingCount ?? null,
        postsCount: raw.postsCount ?? raw.ownerPostsCount ?? null,
        profilePicUrl: raw.profilePicUrl ?? raw.ownerProfilePicUrl ?? null,
        isVerified: raw.verified ?? raw.ownerIsVerified ?? null,
      }
    }
    const reel = normalizeReel(raw)
    if (reel) reels.push(reel)
  }

  return { account, reels, rawCount, rawSample }
}

export async function scrapeInstagramAccounts(
  usernames: string[],
  limitPerAccount = 20,
): Promise<ApifyReelItem[]> {
  const directUrls = usernames.map((u) => `https://www.instagram.com/${u}/`)
  const items = await apifyPost({
    directUrls,
    resultsType: 'posts',
    resultsLimit: limitPerAccount,
    addParentData: true,
  }, 300_000)

  return (items as any[]).map(normalizeReel).filter((r): r is ApifyReelItem => r !== null)
}
