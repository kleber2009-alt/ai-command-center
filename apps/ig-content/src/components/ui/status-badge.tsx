import { Badge } from './badge'
import { STATUS_LABELS } from '@/lib/templates'

const VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'muted' | 'outline'> = {
  idea: 'muted',
  generated: 'secondary',
  in_review: 'warning',
  ready: 'default',
  published: 'success',
  needs_revision: 'warning',
  draft: 'muted',
  active: 'default',
  completed: 'success',
  archived: 'muted',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANT[status] ?? 'muted'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
