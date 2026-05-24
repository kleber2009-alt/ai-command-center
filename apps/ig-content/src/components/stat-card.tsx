import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  className,
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  hint?: string
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn('rounded-md bg-primary/10 p-2 text-primary')}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
