import { getDb } from './db'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InstagramAccount = {
  id: string
  username: string
  full_name: string | null
  bio: string | null
  followers_count: number | null
  following_count: number | null
  posts_count: number | null
  profile_pic_url: string | null
  is_verified: boolean
  scraped_at: string
  created_at: string
  updated_at: string
}

export type InstagramReel = {
  id: string
  account_id: string
  shortcode: string
  instagram_url: string
  caption: string | null
  hashtags: string[] | null
  audio_title: string | null
  published_at: string | null
  views_count: number
  likes_count: number
  comments_count: number
  duration: number | null
  thumbnail_url: string | null
  video_url: string | null
  transcript: string | null
  viral_score: number
  created_at: string
  updated_at: string
}

export type AnalysisReport = {
  id: string
  account_id: string | null
  report_type: string
  input_data: Record<string, unknown>
  summary: string | null
  top_hooks: unknown
  top_topics: unknown
  viral_patterns: unknown
  content_recommendations: unknown
  weak_points: unknown
  created_at: string
}

export type TrendReport = {
  id: string
  niche: string
  competitors: string[] | null
  language: string
  geo: string
  top_reels: unknown
  trend_patterns: unknown
  trending_hooks: unknown
  trending_audios: unknown
  content_ideas: unknown
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// postgres library returns bigint/numeric columns as strings; coerce back to JS numbers
function coerceReel(row: any): InstagramReel {
  return {
    ...row,
    views_count: Number(row.views_count),
    likes_count: Number(row.likes_count),
    comments_count: Number(row.comments_count),
    viral_score: Number(row.viral_score),
    duration: row.duration != null ? Number(row.duration) : null,
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function upsertAccount(data: {
  username: string
  full_name?: string | null
  bio?: string | null
  followers_count?: number | null
  following_count?: number | null
  posts_count?: number | null
  profile_pic_url?: string | null
  is_verified?: boolean
}): Promise<InstagramAccount | null> {
  const db = getDb()
  if (!db) return null
  const rows = await db`
    INSERT INTO instagram_accounts
      (username, full_name, bio, followers_count, following_count, posts_count, profile_pic_url, is_verified, scraped_at, updated_at)
    VALUES
      (${data.username}, ${data.full_name ?? null}, ${data.bio ?? null},
       ${data.followers_count ?? null}, ${data.following_count ?? null}, ${data.posts_count ?? null},
       ${data.profile_pic_url ?? null}, ${data.is_verified ?? false}, now(), now())
    ON CONFLICT (username) DO UPDATE SET
      full_name       = EXCLUDED.full_name,
      bio             = EXCLUDED.bio,
      followers_count = EXCLUDED.followers_count,
      following_count = EXCLUDED.following_count,
      posts_count     = EXCLUDED.posts_count,
      profile_pic_url = EXCLUDED.profile_pic_url,
      is_verified     = EXCLUDED.is_verified,
      scraped_at      = now(),
      updated_at      = now()
    RETURNING *
  `
  return (rows[0] as InstagramAccount) ?? null
}

export async function getAccountByUsername(username: string): Promise<InstagramAccount | null> {
  const db = getDb()
  if (!db) return null
  const rows = await db`SELECT * FROM instagram_accounts WHERE username = ${username}`
  return (rows[0] as InstagramAccount) ?? null
}

// ─── Reels ────────────────────────────────────────────────────────────────────

export async function upsertReel(data: {
  account_id: string
  shortcode: string
  instagram_url: string
  caption?: string | null
  hashtags?: string[] | null
  audio_title?: string | null
  published_at?: string | null
  views_count?: number
  likes_count?: number
  comments_count?: number
  duration?: number | null
  thumbnail_url?: string | null
  video_url?: string | null
  viral_score?: number
}): Promise<InstagramReel | null> {
  const db = getDb()
  if (!db) return null
  const rows = await db`
    INSERT INTO instagram_reels
      (account_id, shortcode, instagram_url, caption, hashtags, audio_title, published_at,
       views_count, likes_count, comments_count, duration, thumbnail_url, video_url, viral_score, updated_at)
    VALUES
      (${data.account_id}, ${data.shortcode}, ${data.instagram_url},
       ${data.caption ?? null}, ${data.hashtags ?? null}, ${data.audio_title ?? null},
       ${data.published_at ?? null}, ${data.views_count ?? 0}, ${data.likes_count ?? 0},
       ${data.comments_count ?? 0}, ${data.duration ?? null}, ${data.thumbnail_url ?? null},
       ${data.video_url ?? null}, ${data.viral_score ?? 0}, now())
    ON CONFLICT (shortcode) DO UPDATE SET
      caption        = EXCLUDED.caption,
      hashtags       = EXCLUDED.hashtags,
      audio_title    = EXCLUDED.audio_title,
      views_count    = EXCLUDED.views_count,
      likes_count    = EXCLUDED.likes_count,
      comments_count = EXCLUDED.comments_count,
      duration       = EXCLUDED.duration,
      thumbnail_url  = EXCLUDED.thumbnail_url,
      video_url      = EXCLUDED.video_url,
      viral_score    = EXCLUDED.viral_score,
      updated_at     = now()
    RETURNING *
  `
  return rows[0] ? coerceReel(rows[0]) : null
}

export async function updateReelTranscript(shortcode: string, transcript: string): Promise<void> {
  const db = getDb()
  if (!db) return
  await db`
    UPDATE instagram_reels SET transcript = ${transcript}, updated_at = now() WHERE shortcode = ${shortcode}
  `
}

export async function getReelsByAccount(accountId: string, limit = 50): Promise<InstagramReel[]> {
  const db = getDb()
  if (!db) return []
  const rows = await db`
    SELECT * FROM instagram_reels
    WHERE account_id = ${accountId}
    ORDER BY viral_score DESC, views_count DESC
    LIMIT ${limit}
  `
  return (rows as any[]).map(coerceReel)
}

export async function getTopReels(accountIds: string[], limit = 50): Promise<InstagramReel[]> {
  const db = getDb()
  if (!db) return []
  const rows = await db`
    SELECT * FROM instagram_reels
    WHERE account_id = ANY(${accountIds})
    ORDER BY viral_score DESC
    LIMIT ${limit}
  `
  return (rows as any[]).map(coerceReel)
}

// ─── Analysis Reports ─────────────────────────────────────────────────────────

export async function saveAnalysisReport(data: {
  account_id?: string | null
  report_type: string
  input_data?: Record<string, unknown>
  summary?: string | null
  top_hooks?: unknown
  top_topics?: unknown
  viral_patterns?: unknown
  content_recommendations?: unknown
  weak_points?: unknown
}): Promise<AnalysisReport | null> {
  const db = getDb()
  if (!db) return null
  const rows = await db`
    INSERT INTO instagram_analysis_reports
      (account_id, report_type, input_data, summary, top_hooks, top_topics,
       viral_patterns, content_recommendations, weak_points)
    VALUES
      (${data.account_id ?? null}, ${data.report_type},
       ${JSON.stringify(data.input_data ?? {})},
       ${data.summary ?? null},
       ${data.top_hooks !== undefined ? JSON.stringify(data.top_hooks) : null},
       ${data.top_topics !== undefined ? JSON.stringify(data.top_topics) : null},
       ${data.viral_patterns !== undefined ? JSON.stringify(data.viral_patterns) : null},
       ${data.content_recommendations !== undefined ? JSON.stringify(data.content_recommendations) : null},
       ${data.weak_points !== undefined ? JSON.stringify(data.weak_points) : null})
    RETURNING *
  `
  return (rows[0] as AnalysisReport) ?? null
}

export async function getAnalysisReport(id: string): Promise<AnalysisReport | null> {
  const db = getDb()
  if (!db) return null
  const rows = await db`SELECT * FROM instagram_analysis_reports WHERE id = ${id}`
  return (rows[0] as AnalysisReport) ?? null
}

// ─── Trend Reports ────────────────────────────────────────────────────────────

export async function saveTrendReport(data: {
  niche: string
  competitors?: string[] | null
  language?: string
  geo?: string
  top_reels?: unknown
  trend_patterns?: unknown
  trending_hooks?: unknown
  trending_audios?: unknown
  content_ideas?: unknown
}): Promise<TrendReport | null> {
  const db = getDb()
  if (!db) return null
  const rows = await db`
    INSERT INTO trend_research_reports
      (niche, competitors, language, geo, top_reels, trend_patterns, trending_hooks, trending_audios, content_ideas)
    VALUES
      (${data.niche}, ${data.competitors ?? null}, ${data.language ?? 'ru'}, ${data.geo ?? 'global'},
       ${data.top_reels !== undefined ? JSON.stringify(data.top_reels) : null},
       ${data.trend_patterns !== undefined ? JSON.stringify(data.trend_patterns) : null},
       ${data.trending_hooks !== undefined ? JSON.stringify(data.trending_hooks) : null},
       ${data.trending_audios !== undefined ? JSON.stringify(data.trending_audios) : null},
       ${data.content_ideas !== undefined ? JSON.stringify(data.content_ideas) : null})
    RETURNING *
  `
  return (rows[0] as TrendReport) ?? null
}

export async function getTrendReport(id: string): Promise<TrendReport | null> {
  const db = getDb()
  if (!db) return null
  const rows = await db`SELECT * FROM trend_research_reports WHERE id = ${id}`
  return (rows[0] as TrendReport) ?? null
}

// ─── Listing ──────────────────────────────────────────────────────────────────

export type ReportListItem = {
  id: string
  report_type: string
  label: string
  created_at: string
}

export async function listAllReports(): Promise<ReportListItem[]> {
  const db = getDb()
  if (!db) return []

  const analysis = await db`
    SELECT r.id, r.report_type, COALESCE(a.username, 'unknown') AS label, r.created_at
    FROM instagram_analysis_reports r
    LEFT JOIN instagram_accounts a ON a.id = r.account_id
    ORDER BY r.created_at DESC LIMIT 20
  `
  const trends = await db`
    SELECT id, 'trend' AS report_type, niche AS label, created_at
    FROM trend_research_reports
    ORDER BY created_at DESC LIMIT 20
  `

  return [...(analysis as unknown as ReportListItem[]), ...(trends as unknown as ReportListItem[])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30)
}
