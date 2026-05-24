import Link from 'next/link'
import {
  Eye,
  Film,
  Images,
  Send,
  Users,
  Bookmark,
  Trophy,
  Megaphone,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fetchMetrics, summarize } from '@/lib/analytics'
import { StatCard } from '@/components/stat-card'
import { ReachTimeline, ReachByType } from '@/components/metrics-chart'
import { AiRecommendations } from '@/components/ai-recommendations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()

  const [{ data: campaigns }, { count: daysCount }, metricRows] = await Promise.all([
    supabase.from('campaigns').select('id, title, status, duration').order('created_at', { ascending: false }),
    supabase.from('content_days').select('id', { count: 'exact', head: true }),
    fetchMetrics(supabase),
  ])

  const summary = summarize(metricRows)
  const activeCampaigns = (campaigns ?? []).filter((c) => c.status === 'active')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
          <p className="text-sm text-muted-foreground">
            Серийная контент-система: охваты, форматы и AI-рекомендации.
          </p>
        </div>
        <Link href="/campaigns">
          <Button>
            <Megaphone className="h-4 w-4" />
            Кампании
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Активные серии" value={activeCampaigns.length} icon={Megaphone} />
        <StatCard label="Запланировано дней" value={daysCount ?? 0} icon={Film} />
        <StatCard label="Reels" value={summary.reelsCount} icon={Film} />
        <StatCard label="Карусели" value={summary.carouselCount} icon={Images} />
        <StatCard label="Опубликовано" value={summary.publishedCount} icon={Send} />
        <StatCard label="Суммарный охват" value={formatNumber(summary.totalReach)} icon={Eye} />
        <StatCard
          label="Ср. охват Reels"
          value={formatNumber(summary.avgReelsReach)}
          icon={Film}
        />
        <StatCard
          label="Ср. охват каруселей"
          value={formatNumber(summary.avgCarouselReach)}
          icon={Images}
        />
        <StatCard label="Лиды" value={formatNumber(summary.totalLeads)} icon={Send} />
        <StatCard label="Новые подписчики" value={formatNumber(summary.totalFollows)} icon={Users} />
        <StatCard label="Сохранения" value={formatNumber(summary.totalSaves)} icon={Bookmark} />
        <StatCard
          label="Лучший охват"
          value={formatNumber(summary.best?.views ?? 0)}
          icon={Trophy}
        />
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
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Лучший контент
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.best ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Тема</p>
                  <p className="text-sm">{summary.best.topic ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Хук</p>
                  <p className="text-sm">{summary.best.hook ?? '—'}</p>
                </div>
                <div className="flex gap-6 pt-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Формат</p>
                    <p className="text-sm font-medium capitalize">{summary.best.type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Просмотры</p>
                    <p className="text-sm font-medium">{formatNumber(summary.best.views)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Добавьте метрики опубликованного контента, чтобы увидеть лидера.
              </p>
            )}
          </CardContent>
        </Card>

        <AiRecommendations />
      </div>
    </div>
  )
}
