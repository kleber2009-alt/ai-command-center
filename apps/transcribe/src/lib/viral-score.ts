// Viral score: weighted raw metric → log-normalized 0-100.
//
// Formula per spec:
//   raw = views*0.5 + likes*0.2 + comments*0.2 + engagementRate*0.1
// Then adjusted for recency and performance vs account average.

export function computeEngagementRate(views: number, likes: number, comments: number): number {
  if (views <= 0) return 0
  return ((likes + comments) / views) * 100
}

export function computeAccountAvgViews(reels: { views_count: number }[]): number {
  if (reels.length === 0) return 0
  return reels.reduce((s, r) => s + r.views_count, 0) / reels.length
}

export function calculateViralScore(
  reel: {
    views_count: number
    likes_count: number
    comments_count: number
    published_at?: string | null
  },
  accountAvgViews = 0,
): number {
  const { views_count, likes_count, comments_count, published_at } = reel

  const engRate = computeEngagementRate(views_count, likes_count, comments_count)

  // Raw weighted score (spec formula)
  const raw = views_count * 0.5 + likes_count * 0.2 + comments_count * 0.2 + engRate * 0.1

  // Recency multiplier: newer posts boosted
  let recency = 1.0
  if (published_at) {
    const ageDays = (Date.now() - new Date(published_at).getTime()) / 86_400_000
    if (ageDays <= 7) recency = 1.35
    else if (ageDays <= 30) recency = 1.15
    else if (ageDays > 90) recency = 0.9
  }

  // Ratio vs account average (log-dampened)
  const ratio = accountAvgViews > 0 ? views_count / accountAvgViews : 1
  const ratioBoost = Math.log10(Math.max(ratio, 0.05) + 1) * 15

  const boosted = raw * recency + ratioBoost

  // Log-normalize to 0-100.
  // log10(5e6) ≈ 6.7 → a 5M-view reel with typical engagement ≈ 95+
  const LOG_MAX = 6.7
  const normalized = Math.round((Math.log10(Math.max(boosted, 1)) / LOG_MAX) * 100)
  return Math.min(100, Math.max(0, normalized))
}

// Batch-compute viral scores and attach them to a reels array.
// Mutates the `viral_score` field in-place.
export function attachViralScores<T extends { views_count: number; likes_count: number; comments_count: number; published_at?: string | null; viral_score: number }>(
  reels: T[],
): T[] {
  const avg = computeAccountAvgViews(reels)
  for (const r of reels) {
    r.viral_score = calculateViralScore(r, avg)
  }
  return reels
}
