import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/ui/status-badge'
import { StatCard } from '@/components/stat-card'
import { GeneratePlanButton } from '@/components/generate-plan-button'
import { ContentCalendar } from '@/components/content-calendar'
import type { Campaign, ContentDay } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!campaign) notFound()
  const c = campaign as Campaign

  const { data: daysData } = await supabase
    .from('content_days')
    .select('*')
    .eq('campaign_id', c.id)
    .order('day_number', { ascending: true })

  const days = (daysData ?? []) as ContentDay[]
  const published = days.filter((d) => d.status === 'published').length
  const ready = days.filter((d) => d.status === 'ready').length

  return (
    <div className="space-y-8">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Все кампании
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{c.topic}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-sm text-muted-foreground">
            {c.goal && <span><span className="text-foreground">Цель:</span> {c.goal}</span>}
            {c.offer && <span><span className="text-foreground">Оффер:</span> {c.offer}</span>}
            {c.lead_magnet && <span><span className="text-foreground">Лид-магнит:</span> {c.lead_magnet}</span>}
          </div>
        </div>
        <GeneratePlanButton campaignId={c.id} duration={c.duration} hasDays={days.length > 0} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Дней в плане" value={`${days.length} / ${c.duration}`} />
        <StatCard label="Готово" value={ready} />
        <StatCard label="Опубликовано" value={published} />
        <StatCard
          label="Прогресс"
          value={`${days.length ? Math.round((published / days.length) * 100) : 0}%`}
        />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Контент-календарь</h2>
        <ContentCalendar days={days} />
      </div>
    </div>
  )
}
