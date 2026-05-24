'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'

export interface LibraryRow {
  id: string
  type: string
  source: string
  topic: string | null
  hook: string | null
  cta: string | null
  format: string | null
  performance_score: number
  created_at: string
}

const TYPES = [
  ['reels', 'Reels'],
  ['carousel', 'Карусель'],
  ['post', 'Пост'],
  ['story', 'Сторис'],
  ['dm', 'Сообщение'],
  ['offer', 'Оффер'],
  ['case', 'Кейс'],
  ['review', 'Отзыв'],
  ['prompt', 'Промпт'],
  ['reference', 'Референс'],
  ['hook', 'Хук'],
]
const SOURCES = [
  ['own', 'Мой контент'],
  ['competitor', 'Конкурент'],
  ['reference', 'Референс'],
]

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCES)
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES)

export function LibraryManager({ initialItems }: { initialItems: LibraryRow[] }) {
  const [items, setItems] = useState<LibraryRow[]>(initialItems)
  const [type, setType] = useState('reels')
  const [source, setSource] = useState('own')
  const [topic, setTopic] = useState('')
  const [hook, setHook] = useState('')
  const [content, setContent] = useState('')
  const [cta, setCta] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!topic && !hook && !content) {
      setError('Заполните хотя бы тему, хук или текст')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, source, topic, hook, content, cta }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось добавить')
      setItems((prev) => [json.item, ...prev])
      setTopic('')
      setHook('')
      setContent('')
      setCta('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/library/${id}`, { method: 'DELETE' })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium">Добавить материал</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Источник</Label>
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Тема</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Хук</Label>
            <Input value={hook} onChange={(e) => setHook(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Текст / содержание</Label>
            <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>CTA</Label>
            <Input value={cta} onChange={(e) => setCta(e.target.value)} />
          </div>
          <Button onClick={add} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Добавить в базу
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              База знаний пуста. Загрузите свой лучший контент, референсы, офферы и отзывы —
              агент будет опираться на них при генерации.
            </p>
          </div>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
            >
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    {TYPE_LABEL[it.type] ?? it.type}
                  </span>
                  <span>{SOURCE_LABEL[it.source] ?? it.source}</span>
                  {it.performance_score > 0 && (
                    <span className="tabular-nums">score {it.performance_score}</span>
                  )}
                </div>
                <p className="truncate text-sm font-medium">{it.topic ?? it.hook ?? '—'}</p>
                {it.hook && it.topic && (
                  <p className="truncate text-xs text-muted-foreground">{it.hook}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
