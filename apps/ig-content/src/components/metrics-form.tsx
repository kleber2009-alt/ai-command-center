'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { Metric } from '@/types/database'

const FIELDS: { key: keyof FormState; label: string }[] = [
  { key: 'views', label: 'Просмотры' },
  { key: 'likes', label: 'Лайки' },
  { key: 'comments', label: 'Комментарии' },
  { key: 'saves', label: 'Сохранения' },
  { key: 'shares', label: 'Репосты' },
  { key: 'follows', label: 'Подписки' },
  { key: 'leads', label: 'Лиды' },
]

interface FormState {
  views: string
  likes: string
  comments: string
  saves: string
  shares: string
  follows: string
  leads: string
}

const EMPTY: FormState = {
  views: '', likes: '', comments: '', saves: '', shares: '', follows: '', leads: '',
}

export function MetricsForm({ dayId, existing }: { dayId: string; existing: Metric[] }) {
  const router = useRouter()
  const [contentType, setContentType] = useState<'reels' | 'carousel'>('reels')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch(`/api/content-days/${dayId}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: contentType,
          ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v) || 0])),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось сохранить метрики')
      setForm(EMPTY)
      setDone(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {existing.length > 0 && (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2 text-left font-medium">Формат</th>
                <th className="p-2 text-right font-medium">Просм.</th>
                <th className="p-2 text-right font-medium">Сохр.</th>
                <th className="p-2 text-right font-medium">Подп.</th>
                <th className="p-2 text-right font-medium">Лиды</th>
              </tr>
            </thead>
            <tbody>
              {existing.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="p-2 capitalize">{m.content_type}</td>
                  <td className="p-2 text-right">{m.views}</td>
                  <td className="p-2 text-right">{m.saves}</td>
                  <td className="p-2 text-right">{m.follows}</td>
                  <td className="p-2 text-right">{m.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ct">Формат</Label>
          <Select
            id="ct"
            value={contentType}
            onChange={(e) => setContentType(e.target.value as 'reels' | 'carousel')}
          >
            <option value="reels">Reels</option>
            <option value="carousel">Карусель</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="text-xs">{label}</Label>
              <Input
                id={key}
                type="number"
                min={0}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {done && !saving && <Check className="h-4 w-4" />}
          Сохранить метрики
        </Button>
      </form>
    </div>
  )
}
