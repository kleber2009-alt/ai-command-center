'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Save, Check, Images, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ContentFeedback } from '@/components/content-feedback'
import type { Carousel, CarouselSlide } from '@/types/database'

export function CarouselEditor({ dayId, carousel }: { dayId: string; carousel: Carousel | null }) {
  const router = useRouter()
  const [current, setCurrent] = useState<Carousel | null>(carousel)
  const [coverTitle, setCoverTitle] = useState(carousel?.cover_title ?? '')
  const [slides, setSlides] = useState<CarouselSlide[]>(carousel?.slides ?? [])
  const [caption, setCaption] = useState(carousel?.caption ?? '')
  const [cta, setCta] = useState(carousel?.cta ?? '')
  const [designPrompt, setDesignPrompt] = useState(carousel?.design_prompt ?? '')
  const [hashtags, setHashtags] = useState((carousel?.hashtags ?? []).join(' '))
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function hydrate(c: Carousel) {
    setCurrent(c)
    setCoverTitle(c.cover_title ?? '')
    setSlides(c.slides ?? [])
    setCaption(c.caption ?? '')
    setCta(c.cta ?? '')
    setDesignPrompt(c.design_prompt ?? '')
    setHashtags((c.hashtags ?? []).join(' '))
  }

  async function generate() {
    if (current && !confirm('Перегенерировать карусель? Текущая версия будет заменена.')) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-days/${dayId}/generate-carousel`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка генерации')
      hydrate(json.carousel)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setGenerating(false)
    }
  }

  function updateSlide(i: number, patch: Partial<CarouselSlide>) {
    setSlides((s) => s.map((sl, idx) => (idx === i ? { ...sl, ...patch } : sl)))
  }
  function addSlide() {
    setSlides((s) => [...s, { slide: s.length + 1, title: '', body: '' }])
  }
  function removeSlide(i: number) {
    setSlides((s) => s.filter((_, idx) => idx !== i).map((sl, idx) => ({ ...sl, slide: idx + 1 })))
  }

  async function save() {
    if (!current) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/carousels/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cover_title: coverTitle,
          slides: slides.map((s, i) => ({ slide: i + 1, title: s.title ?? '', body: s.body })),
          caption,
          cta,
          design_prompt: designPrompt,
          hashtags: hashtags.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось сохранить')
      setCurrent(json.carousel)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Images className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Карусель ещё не сгенерирована. Claude создаст обложку, 8–10 слайдов, подпись,
          CTA и промпт для дизайна.
        </p>
        <Button onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? 'Генерация…' : 'Сгенерировать карусель'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Перегенерировать
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          Сохранить
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Заголовок обложки</Label>
        <Input value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Слайды</Label>
          <Button size="sm" variant="ghost" onClick={addSlide}>
            <Plus className="h-4 w-4" />
            Слайд
          </Button>
        </div>
        {slides.map((s, i) => (
          <div key={i} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-primary">Слайд {i + 1}</span>
              <button
                type="button"
                onClick={() => removeSlide(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input
              className="mb-2"
              placeholder="Заголовок слайда"
              value={s.title ?? ''}
              onChange={(e) => updateSlide(i, { title: e.target.value })}
            />
            <Textarea
              rows={3}
              placeholder="Текст слайда"
              value={s.body}
              onChange={(e) => updateSlide(i, { body: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label>Подпись</Label>
        <Textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>CTA</Label>
        <Input value={cta} onChange={(e) => setCta(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Промпт для дизайна / Midjourney</Label>
        <Textarea rows={3} value={designPrompt} onChange={(e) => setDesignPrompt(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Хэштеги</Label>
        <Textarea rows={2} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ContentFeedback contentId={current.id} contentType="carousel" />
    </div>
  )
}
