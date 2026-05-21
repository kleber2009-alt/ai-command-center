import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { scrapeInstagramAccount, isApifyConfigured } from '@/lib/apify-client'
import { upsertAccount, upsertReel, getReelsByAccount, saveAnalysisReport } from '@/lib/instagram-db'
import { calculateViralScore, computeAccountAvgViews } from '@/lib/viral-score'
import { analyzeAccount } from '@/lib/instagram-analysis'

export const maxDuration = 300 // Apify + AI can take up to 5 min

type Body = {
  username: string
  period?: '7d' | '30d' | '90d'
  mode?: 'quick' | 'deep'
}

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'ig-analyze', max: 5, windowMs: 60_000 },
    requireInitData: false,
  })
  if (!guard.ok) return guard.response

  if (!isApifyConfigured()) {
    return NextResponse.json({ error: 'APIFY_API_TOKEN не настроен' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен' }, { status: 503 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  const rawInput = body.username?.trim() ?? ''
  const urlMatch = rawInput.match(/instagram\.com\/([A-Za-z0-9._-]+)/)
  const username = urlMatch ? urlMatch[1] : rawInput.replace(/^@/, '')
  if (!username) {
    return NextResponse.json({ error: 'username обязателен' }, { status: 400 })
  }

  const period = body.period ?? '30d'
  const mode = body.mode ?? 'quick'
  const reelLimit = mode === 'deep' ? 50 : 30

  // 1. Scrape account + reels via Apify
  let scraped: Awaited<ReturnType<typeof scrapeInstagramAccount>>
  try {
    scraped = await scrapeInstagramAccount(username, reelLimit)
  } catch (e: any) {
    if (e?.status === 404) {
      return NextResponse.json({ error: `Аккаунт @${username} не найден или приватный` }, { status: 404 })
    }
    return NextResponse.json({ error: e?.message ?? 'Ошибка Apify' }, { status: 502 })
  }

  if (scraped.reels.length === 0) {
    return NextResponse.json({
      error: `У @${username} нет публичных Reels`,
      debug: { rawCount: scraped.rawCount, rawFields: scraped.rawSample },
    }, { status: 404 })
  }

  // 2. Persist account
  const account = await upsertAccount({
    username: scraped.account.username,
    full_name: scraped.account.fullName,
    bio: scraped.account.bio,
    followers_count: scraped.account.followersCount ?? null,
    following_count: scraped.account.followingCount ?? null,
    posts_count: scraped.account.postsCount ?? null,
    profile_pic_url: scraped.account.profilePicUrl,
    is_verified: scraped.account.isVerified ?? false,
  })

  if (!account) {
    return NextResponse.json({ error: 'Ошибка сохранения аккаунта в БД' }, { status: 500 })
  }

  // 3. Compute viral scores and persist reels
  const rawReels = scraped.reels.map((r) => ({
    views_count: r.videoViewCount ?? 0,
    likes_count: r.likesCount ?? 0,
    comments_count: r.commentsCount ?? 0,
    published_at: r.timestamp ?? null,
  }))
  const avgViews = computeAccountAvgViews(rawReels)

  const savedReels = await Promise.all(
    scraped.reels.map(async (r) => {
      const score = calculateViralScore(
        {
          views_count: r.videoViewCount ?? 0,
          likes_count: r.likesCount ?? 0,
          comments_count: r.commentsCount ?? 0,
          published_at: r.timestamp ?? null,
        },
        avgViews,
      )
      return upsertReel({
        account_id: account.id,
        shortcode: r.shortCode,
        instagram_url: r.url,
        caption: r.caption,
        hashtags: r.hashtags,
        audio_title: r.musicInfo?.songName
          ? `${r.musicInfo.songName}${r.musicInfo.artistName ? ' — ' + r.musicInfo.artistName : ''}`
          : null,
        published_at: r.timestamp,
        views_count: r.videoViewCount ?? 0,
        likes_count: r.likesCount ?? 0,
        comments_count: r.commentsCount ?? 0,
        duration: r.videoDuration ?? null,
        thumbnail_url: r.displayUrl,
        video_url: r.videoUrl,
        viral_score: score,
      })
    }),
  )

  const reels = savedReels.filter((r) => r !== null)

  // 4. AI analysis
  let analysis: Awaited<ReturnType<typeof analyzeAccount>>
  try {
    analysis = await analyzeAccount(account, reels as NonNullable<typeof reels[0]>[])
  } catch (e: any) {
    return NextResponse.json({ error: `AI-анализ не удался: ${e?.message}` }, { status: 500 })
  }

  // 5. Save report
  const report = await saveAnalysisReport({
    account_id: account.id,
    report_type: 'account',
    input_data: { username, period, mode },
    summary: analysis.summary,
    top_hooks: analysis.top_hooks,
    top_topics: analysis.top_topics,
    viral_patterns: analysis.viral_patterns,
    content_recommendations: analysis.recommendations,
    weak_points: analysis.weak_points,
  })

  // 6. Return sorted reels from DB for consistent response
  const topReels = await getReelsByAccount(account.id, 50)

  return NextResponse.json({
    account,
    topReels,
    analysis,
    report: report ? { id: report.id, created_at: report.created_at } : null,
  })
}
