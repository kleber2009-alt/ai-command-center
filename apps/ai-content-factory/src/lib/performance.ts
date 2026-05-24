// Internal performance score for a piece of content. Weights reward the signals
// that actually matter for growth (saves, shares, follows, leads) over vanity
// metrics (views, likes), so the RAG layer ranks "what worked" correctly.

export interface ContentMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  follows?: number;
  leads?: number;
}

const WEIGHTS: Required<Record<keyof ContentMetrics, number>> = {
  views: 0.2,
  likes: 0, // tracked but not rewarded — a vanity metric
  comments: 1.5,
  saves: 2,
  shares: 3,
  follows: 5,
  leads: 10,
};

export function performanceScore(metrics?: ContentMetrics): number {
  if (!metrics) return 0;
  let score = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof ContentMetrics)[]) {
    score += (metrics[key] ?? 0) * WEIGHTS[key];
  }
  return Math.round(score * 100) / 100;
}
