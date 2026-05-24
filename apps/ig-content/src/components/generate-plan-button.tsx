'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function GeneratePlanButton({
  campaignId,
  duration,
  hasDays,
}: {
  campaignId: string
  duration: number
  hasDays: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (hasDays && !confirm('План уже существует. Перегенерировать и заменить все дни?')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/generate-plan`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось сгенерировать план')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={generate} disabled={loading} variant={hasDays ? 'outline' : 'default'}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'Генерация…' : hasDays ? `Перегенерировать план` : `Сгенерировать план на ${duration} дней`}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
