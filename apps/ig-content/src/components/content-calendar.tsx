import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/utils'
import type { ContentDay } from '@/types/database'

export function ContentCalendar({ days }: { days: ContentDay[] }) {
  if (days.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          План ещё не сгенерирован. Нажмите «Сгенерировать план», чтобы Claude построил
          серию контента.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {days.map((d) => (
        <Link key={d.id} href={`/content/${d.id}`} className="group">
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">День {d.day_number}</span>
                <StatusBadge status={d.status} />
              </div>
              <p className="line-clamp-2 text-sm font-medium">{d.topic ?? 'Без темы'}</p>
              {d.main_hook && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{d.main_hook}</p>
              )}
              <p className="pt-1 text-xs text-muted-foreground">{formatDate(d.date)}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
