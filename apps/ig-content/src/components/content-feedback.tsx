'use client'

import { useState } from 'react'
import { Star, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const TAGS = [
  'слабый хук',
  'не мой стиль',
  'мало конкретики',
  'слишком сложно',
  'слишком банально',
  'плохая структура',
  'слабый CTA',
  'не подходит визуально',
  'можно публиковать',
]

// Lets the user rate a generated unit (1-5) + pick reason tags. The rating
// feeds the RAG context and the weekly learning summary.
export function ContentFeedback({
  contentId,
  contentType,
}: {
  contentId: string
  contentType: 'reels' | 'carousel'
}) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  async function submit() {
    if (!rating) {
      setError('Поставьте оценку от 1 до 5')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_id: contentId,
          content_type: contentType,
          rating,
          feedback_tags: tags,
          comment: comment || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось отправить')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-primary" />
        Спасибо! Оценка учтена — агент станет точнее.
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Оцените результат — агент учится на ваших оценках</p>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n}`}
            >
              <Star
                className={cn(
                  'h-5 w-5 transition-colors',
                  (hover || rating) >= n
                    ? 'fill-primary text-primary'
                    : 'text-muted-foreground',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggleTag(t)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              tags.includes(t)
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <Textarea
        rows={2}
        placeholder="Комментарий (необязательно)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Отправить оценку
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}
