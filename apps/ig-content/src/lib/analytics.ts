import type { SupabaseClient } from '@supabase/supabase-js'

export interface MetricRow {
  id: string
  content_type: 'reels' | 'carousel'
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  follows: number
  leads: number
  published_at: string | null
  content_days: {
    id: string
    topic: string | null
    main_hook: string | null
    campaign_id: string
  } | null
}

export interface AnalyticsSummary {
  totalReach: number
  avgReelsReach: number
  avgCarouselReach: number
  totalLeads: number
  totalFollows: number
  totalSaves: number
  reelsCount: number
  carouselCount: number
  publishedCount: number
  best: {
    topic: string | null
    hook: string | null
    views: number
    type: string
  } | null
  topHooks: { hook: string; views: number }[]
  topTopics: { topic: string; views: number }[]
  reachByType: { name: string; reach: number }[]
  timeline: { label: string; views: number; saves: number }[]
}

// Pulls every metrics row the user can see (RLS-scoped) plus joined day info.
export async function fetchMetrics(supabase: SupabaseClient): Promise<MetricRow[]> {
  const { data } = await supabase
    .from('metrics')
    .select(
      'id, content_type, views, likes, comments, saves, shares, follows, leads, published_at, content_days(id, topic, main_hook, campaign_id)',
    )
    .order('published_at', { ascending: true })
  return (data as unknown as MetricRow[]) ?? []
}

export function summarize(rows: MetricRow[]): AnalyticsSummary {
  const reels = rows.filter((r) => r.content_type === 'reels')
  const carousels = rows.filter((r) => r.content_type === 'carousel')

  const sum = (arr: MetricRow[], key: keyof MetricRow) =>
    arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)

  const avg = (arr: MetricRow[]) =>
    arr.length ? Math.round(sum(arr, 'views') / arr.length) : 0

  let best: AnalyticsSummary['best'] = null
  for (const r of rows) {
    if (!best || r.views > best.views) {
      best = {
        topic: r.content_days?.topic ?? null,
        hook: r.content_days?.main_hook ?? null,
        views: r.views,
        type: r.content_type,
      }
    }
  }

  const byHook = new Map<string, number>()
  const byTopic = new Map<string, number>()
  for (const r of rows) {
    const hook = r.content_days?.main_hook
    const topic = r.content_days?.topic
    if (hook) byHook.set(hook, (byHook.get(hook) ?? 0) + r.views)
    if (topic) byTopic.set(topic, (byTopic.get(topic) ?? 0) + r.views)
  }

  const rank = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  return {
    totalReach: sum(rows, 'views'),
    avgReelsReach: avg(reels),
    avgCarouselReach: avg(carousels),
    totalLeads: sum(rows, 'leads'),
    totalFollows: sum(rows, 'follows'),
    totalSaves: sum(rows, 'saves'),
    reelsCount: reels.length,
    carouselCount: carousels.length,
    publishedCount: rows.length,
    best,
    topHooks: rank(byHook).map(([hook, views]) => ({ hook, views })),
    topTopics: rank(byTopic).map(([topic, views]) => ({ topic, views })),
    reachByType: [
      { name: 'Reels', reach: sum(reels, 'views') },
      { name: 'Carousel', reach: sum(carousels, 'views') },
    ],
    timeline: rows.map((r, i) => ({
      label: r.published_at ? new Date(r.published_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : `#${i + 1}`,
      views: r.views,
      saves: r.saves,
    })),
  }
}
