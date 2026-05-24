import Link from 'next/link'
import { CalendarDays, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { CreateCampaignDialog } from '@/components/create-campaign-dialog'
import type { Campaign } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const supabase = createClient()
  const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
  const campaigns = (data ?? []) as Campaign[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Кампании</h1>
          <p className="text-sm text-muted-foreground">
            Серийные контент-кампании на 30 / 60 / 90 дней.
          </p>
        </div>
        <CreateCampaignDialog />
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Пока нет кампаний. Создайте первую серию и сгенерируйте план на 30 дней.
            </p>
            <CreateCampaignDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} className="group">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    <StatusBadge status={c.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.topic}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{c.duration} дней</span>
                    <span className="flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Открыть <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
