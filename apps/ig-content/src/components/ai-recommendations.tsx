'use client'

import { useState } from 'react'
import { Sparkles, Loader2, TrendingUp, RefreshCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalyticsOutput } from '@/lib/agents'

function Section({
  title,
  items,
  icon,
}: {
  title: string
  items: string[]
  icon?: React.ReactNode
}) {
  if (!items?.length) return null
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
            <span className="text-primary">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AiRecommendations() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalyticsOutput | null>(null)

  async function analyze() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analytics/analyze', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка анализа')
      setAnalysis(json.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка анализа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI-рекомендации
        </CardTitle>
        <Button size="sm" variant={analysis ? 'outline' : 'default'} onClick={analyze} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : analysis ? (
            <RefreshCcw className="h-4 w-4" />
          ) : null}
          {analysis ? 'Обновить' : 'Анализировать'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!analysis && !error && (
          <p className="text-sm text-muted-foreground">
            Нажмите «Анализировать», чтобы Claude изучил опубликованные метрики и предложил
            направление на следующие 7 дней.
          </p>
        )}

        {analysis && (
          <>
            <Section
              title="Что повторить"
              items={analysis.repeat}
              icon={<RefreshCcw className="h-3.5 w-3.5 text-emerald-400" />}
            />
            <Section
              title="Что убрать"
              items={analysis.remove}
              icon={<Trash2 className="h-3.5 w-3.5 text-destructive" />}
            />
            <Section
              title="План на 7 дней"
              items={analysis.next_7_days}
              icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
            />
            <Section title="Рекомендации" items={analysis.recommendations} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
