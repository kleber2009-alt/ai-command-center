'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DEFAULT_CAMPAIGN, DURATION_OPTIONS } from '@/lib/templates'

export function CreateCampaignDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(DEFAULT_CAMPAIGN)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось создать кампанию')
      setOpen(false)
      router.push(`/campaigns/${json.campaign.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Создать кампанию
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Новая серийная кампания</DialogTitle>
          <DialogDescription>
            Шаблон заполнен значениями по умолчанию — отредактируйте под себя.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Название</Label>
              <Input id="title" required value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="topic">Тема</Label>
              <Textarea id="topic" value={form.topic} onChange={(e) => set('topic', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">Цель</Label>
              <Input id="goal" value={form.goal} onChange={(e) => set('goal', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Длительность</Label>
              <Select
                id="duration"
                value={form.duration}
                onChange={(e) => set('duration', Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} дней
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="audience">Аудитория</Label>
              <Input
                id="audience"
                value={form.target_audience}
                onChange={(e) => set('target_audience', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer">Оффер</Label>
              <Input id="offer" value={form.offer} onChange={(e) => set('offer', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead">Лид-магнит</Label>
              <Input
                id="lead"
                value={form.lead_magnet}
                onChange={(e) => set('lead_magnet', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tone">Tone of voice</Label>
              <Input
                id="tone"
                value={form.tone_of_voice}
                onChange={(e) => set('tone_of_voice', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cta">CTA</Label>
              <Input id="cta" value={form.cta} onChange={(e) => set('cta', e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Создать
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
