import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatusSelector } from '@/components/status-selector'
import { ReelsEditor } from '@/components/reels-editor'
import { CarouselEditor } from '@/components/carousel-editor'
import { MetricsForm } from '@/components/metrics-form'
import { VisualBriefBlock } from '@/components/visual-brief-block'
import { formatDate } from '@/lib/utils'
import type { Campaign, Carousel, ContentDay, Metric, Reel } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function ContentDayPage({ params }: { params: { dayId: string } }) {
  const supabase = createClient()

  const { data: day } = await supabase
    .from('content_days')
    .select('*')
    .eq('id', params.dayId)
    .single()
  if (!day) notFound()
  const d = day as ContentDay

  const [{ data: campaign }, { data: reel }, { data: carousel }, { data: metrics }] =
    await Promise.all([
      supabase.from('campaigns').select('*').eq('id', d.campaign_id).single(),
      supabase.from('reels').select('*').eq('content_day_id', d.id).maybeSingle(),
      supabase.from('carousels').select('*').eq('content_day_id', d.id).maybeSingle(),
      supabase.from('metrics').select('*').eq('content_day_id', d.id),
    ])

  const c = campaign as Campaign | null

  return (
    <div className="space-y-6">
      {c && (
        <Link
          href={`/campaigns/${c.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {c.title}
        </Link>
      )}

      {/* Day header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            День {d.day_number} · {formatDate(d.date)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{d.topic ?? 'Без темы'}</h1>
          {d.main_hook && <p className="max-w-2xl text-sm text-muted-foreground">{d.main_hook}</p>}
        </div>
        <StatusSelector dayId={d.id} status={d.status} />
      </div>

      {(d.daily_meaning || d.cta) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {d.daily_meaning && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Смысл дня (серийность)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{d.daily_meaning}</p>
              </CardContent>
            </Card>
          )}
          {d.cta && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CTA дня</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{d.cta}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Tabs defaultValue="reels">
        <TabsList>
          <TabsTrigger value="reels">Reels</TabsTrigger>
          <TabsTrigger value="carousel">Карусель</TabsTrigger>
          <TabsTrigger value="metrics">Метрики</TabsTrigger>
        </TabsList>

        <TabsContent value="reels">
          <Card>
            <CardHeader>
              <CardTitle>Reels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ReelsEditor dayId={d.id} reel={(reel as Reel) ?? null} />
              <VisualBriefBlock brief={(reel as Reel | null)?.visual_brief ?? null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carousel">
          <Card>
            <CardHeader>
              <CardTitle>Карусель</CardTitle>
            </CardHeader>
            <CardContent>
              <CarouselEditor dayId={d.id} carousel={(carousel as Carousel) ?? null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>Метрики</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsForm dayId={d.id} existing={(metrics as Metric[]) ?? []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
