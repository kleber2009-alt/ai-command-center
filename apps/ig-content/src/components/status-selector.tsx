'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { CONTENT_DAY_STATUSES, STATUS_LABELS } from '@/lib/templates'
import type { ContentDayStatus } from '@/types/database'

export function StatusSelector({
  dayId,
  status,
}: {
  dayId: string
  status: ContentDayStatus
}) {
  const router = useRouter()
  const [value, setValue] = useState<ContentDayStatus>(status)
  const [saving, setSaving] = useState(false)

  async function update(next: ContentDayStatus) {
    setValue(next)
    setSaving(true)
    await fetch(`/api/content-days/${dayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value}
        disabled={saving}
        onChange={(e) => update(e.target.value as ContentDayStatus)}
        className="w-44"
      >
        {CONTENT_DAY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
    </div>
  )
}
