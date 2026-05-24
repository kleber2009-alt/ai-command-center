'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Triggers the weekly learning summary: Claude condenses recent metrics +
// feedback into durable insights stored in agent_learnings.
export function WeeklyLearningButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    setMsg(null)
    try {
      const res = await fetch('/api/learnings', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось')
      setMsg(`Добавлено выводов: ${json.count}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        Сделать выводы за неделю
      </Button>
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
