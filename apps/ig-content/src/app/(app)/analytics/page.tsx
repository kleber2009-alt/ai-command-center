import { TrendingUp, Hash, Lightbulb } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fetchMetrics, summarize } from '@/lib/analytics'
import { StatCard } from '@/components/stat-card'
import { ReachTimeline, ReachByType } from '@/components/metrics-chart'
import { MetricsTable, type MetricTableRow } from '@/components/metrics-table'
import { AiRecommendations } from '@/components/ai-recommendations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const supabase = createClient()
  const rows = await fetchMetrics(supabase)
  const summary = summarize(rows)

  const tableRows: MetricTableRow[] = rows.map((r) => ({
    topic: r.content_days?.topic ?? '—',
    type: r.content_type,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    saves: r.saves,
    shares: r.shares,
    follows: r.follows,
    leads: r.leads,
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Аналитика</h1>
        <p className="text-sm text-muted-foreground">
          Что заходит лучше, лучшие хуки и рекомендации Claude на следующую неделю.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Суммарный охват" value={formatNumber(summary.totalReach)} />
        <StatCard label="Сохранения" value={formatNumber(summary.totalSaves)} />
        <StatCard label="Подписчики" value={formatNumber(summary.totalFollows)} />
        <StatCard label="Лиды" value={formatNumber(summary.totalLeads)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Динамика охвата</CardTitle>
          </CardHeader>
          <CardContent>
            <ReachTimeline data={summary.timeline} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Охват по форматам</CardTitle>
          </CardHeader>
          <CardContent>
            <ReachByType data={summary.reachByType} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Топ темы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RankList items={summary.topTopics.map((t) => ({ label: t.topic, value: t.views }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4 text-primary" />
              Топ хуки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RankList items={summary.topHooks.map((t) => ({ label: t.hook, value: t.views }))} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-primary" />
            Все метрики
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MetricsTable rows={tableRows} />
        </CardContent>
      </Card>

      <AiRecommendations />
    </div>
  )
}

function RankList({ items }: { items: { label: string; value: number }[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Недостаточно данных.</p>
  }
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="line-clamp-1">{it.label}</span>
            <span className="tabular-nums text-muted-foreground">{formatNumber(it.value)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}
