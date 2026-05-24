// Performance score — weighs outcomes that matter (saves, shares, follows,
// leads) far above vanity views. Mirrors calc_performance_score() in
// migration 002. Keep the two in sync.
export interface ScoreInput {
  views?: number | null
  likes?: number | null
  comments?: number | null
  saves?: number | null
  shares?: number | null
  follows?: number | null
  leads?: number | null
}

export function performanceScore(m: ScoreInput): number {
  const n = (v: number | null | undefined) => Number(v) || 0
  return Math.round(
    n(m.views) * 0.2 +
      n(m.saves) * 2 +
      n(m.shares) * 3 +
      n(m.comments) * 1.5 +
      n(m.follows) * 5 +
      n(m.leads) * 10,
  )
}
