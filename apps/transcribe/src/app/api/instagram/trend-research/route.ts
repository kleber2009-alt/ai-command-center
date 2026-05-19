import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { scrapeInstagramAccounts, isApifyConfigured } from '@/lib/apify-client'
import { upsertAccount, upsertReel, getTopReels, saveTrendReport } from '@/lib/instagram-db'
import { calculateViralScore, computeAccountAvgViews } from '@/lib/viral-score'
import { analyzeTrends } from '@/lib/instagram-analysis'

export const maxDuration = 300

type Body = {
  niche: string
  competitors: string[]
  language?: string
  geo?: string
  limit?: number
}

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'ig-trends', max: 3, windowMs: 60_000 },
    ownerOnly: true,
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

  const niche = body.niche?.trim()
  if (!niche) return NextResponse.json({ error: 'niche обязателен' }, { status: 400 })

  const competitors = (body.competitors ?? [])
    .map((u: string) => u.trim().replace(/^@/, ''))
    .filter(Boolean)
  if (competitors.length === 0) {
    return NextResponse.json({ error: 'Укажи хотя бы одного конкурента' }, { status: 400 })
  }
  if (competitors.length > 10) {
    return NextResponse.json({ error: 'Максимум 10 аккаунтов за раз' }, { status: 400 })
  }

  const language = body.language ?? 'ru'
  const geo = body.geo ?? 'global'
  const limitPerAccount = Math.min(body.limit ?? 20, 50)

  // 1. Scrape all competitor accounts in one Apify call
  let rawReels: Awaited<ReturnType<typeof scrapeInstagramAccounts>>
  try {
    rawReels = await scrapeInstagramAccounts(competitors, limitPerAccount)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Ошибка Apify' }, { status: 502 })
  }

  if (rawReels.length === 0) {
    return NextResponse.json({ error: 'Не удалось получить Reels от указанных аккаунтов' }, { status: 404 })
  }

  // 2. Group by owner, upsert accounts + reels
  const byOwner = new Map<string, typeof rawReels>()
  for (const r of rawReels) {
    const owner = r.ownerUsername ?? 'unknown'
    if (!byOwner.has(owner)) byOwner.set(owner, [])
    byOwner.get(owner)!.push(r)
  }

  const accountIds: string[] = []

  await Promise.all(
    Array.from(byOwner.entries()).map(async ([ownerUsername, ownerReels]: [string, typeof rawReels]) => {
      const first = ownerReels[0]
      const acc = await upsertAccount({
        username: ownerUsername,
        full_name: first.ownerFullName,
        bio: first.ownerBio,
        followers_count: first.ownerFollowersCount ?? null,
        following_count: first.ownerFollowingCount ?? null,
        posts_count: first.ownerPostsCount ?? null,
        profile_pic_url: first.ownerProfilePicUrl,
        is_verified: first.ownerIsVerified ?? false,
      })
      if (!acc) return

      accountIds.push(acc.id)

      const avgViews = computeAccountAvgViews(
        ownerReels.map((r: typeof rawReels[0]) => ({ views_count: r.videoViewCount ?? 0 })),
      )

      await Promise.all(
        ownerReels.map((r: typeof rawReels[0]) => {
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
            account_id: acc.id,
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
    }),
  )

  // 3. Load top reels from DB (sorted by viral score)
  const topReels = await getTopReels(accountIds, 50)

  // 4. AI trend analysis
  let analysis: Awaited<ReturnType<typeof analyzeTrends>>
  try {
    analysis = await analyzeTrends(niche, topReels, language)
  } catch (e: any) {
    return NextResponse.json({ error: `AI-анализ не удался: ${e?.message}` }, { status: 500 })
  }

  // 5. Save trend report
  const report = await saveTrendReport({
    niche,
    competitors,
    language,
    geo,
    top_reels: topReels.slice(0, 20).map((r) => ({
      shortcode: r.shortcode,
      url: r.instagram_url,
      views: r.views_count,
      likes: r.likes_count,
      comments: r.comments_count,
      viral_score: r.viral_score,
      caption: r.caption?.slice(0, 200),
    })),
    trend_patterns: analysis.viral_patterns,
    trending_hooks: analysis.top_hooks,
    trending_audios: analysis.trending_audios,
    content_ideas: analysis.content_ideas,
  })

  return NextResponse.json({
    topReels,
    analysis,
    report: report ? { id: report.id, created_at: report.created_at } : null,
  })
}
