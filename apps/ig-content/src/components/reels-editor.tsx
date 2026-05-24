'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Save, Check, Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ContentFeedback } from '@/components/content-feedback'
import type { Reel } from '@/types/database'

type Draft = {
  title: string
  hooks: string
  main_script: string
  video_structure: string
  b_roll_ideas: string
  caption: string
  cta: string
  hashtags: string
  visual_brief: string
}

const toLines = (arr: string[] | undefined) => (arr ?? []).join('\n')
const fromLines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

function toDraft(reel: Reel | null): Draft {
  return {
    title: reel?.title ?? '',
    hooks: toLines(reel?.hooks),
    main_script: reel?.main_script ?? '',
    video_structure: toLines(reel?.video_structure),
    b_roll_ideas: toLines(reel?.b_roll_ideas),
    caption: reel?.caption ?? '',
    cta: reel?.cta ?? '',
    hashtags: (reel?.hashtags ?? []).join(' '),
    visual_brief: reel?.visual_brief ?? '',
  }
}

export function ReelsEditor({ dayId, reel }: { dayId: string; reel: Reel | null }) {
  const router = useRouter()
  const [current, setCurrent] = useState<Reel | null>(reel)
  const [draft, setDraft] = useState<Draft>(toDraft(reel))
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function generate() {
    if (current && !confirm('Перегенерировать Reels? Текущая версия будет заменена.')) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-days/${dayId}/generate-reels`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ошибка генерации')
      setCurrent(json.reel)
      setDraft(toDraft(json.reel))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    if (!current) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/reels/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
          hooks: fromLines(draft.hooks),
          main_script: draft.main_script,
          video_structure: fromLines(draft.video_structure),
          b_roll_ideas: fromLines(draft.b_roll_ideas),
          caption: draft.caption,
          cta: draft.cta,
          hashtags: draft.hashtags.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean),
          visual_brief: draft.visual_brief,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Не удалось сохранить')
      setCurrent(json.reel)
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
        <Film className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Reels ещё не сгенерированы. Claude создаст 5 хуков, сценарий 45–60 сек, структуру,
          b-roll, подпись и хэштеги.
        </p>
        <Button onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? 'Генерация…' : 'Сгенерировать Reels'}
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

      <Field label="Заголовок">
        <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label="Хуки (по одному на строку)">
        <Textarea rows={5} value={draft.hooks} onChange={(e) => set('hooks', e.target.value)} />
      </Field>
      <Field label="Сценарий (45–60 сек)">
        <Textarea rows={8} value={draft.main_script} onChange={(e) => set('main_script', e.target.value)} />
      </Field>
      <Field label="Структура видео (по сценам)">
        <Textarea rows={6} value={draft.video_structure} onChange={(e) => set('video_structure', e.target.value)} />
      </Field>
      <Field label="B-roll идеи">
        <Textarea rows={4} value={draft.b_roll_ideas} onChange={(e) => set('b_roll_ideas', e.target.value)} />
      </Field>
      <Field label="Подпись">
        <Textarea rows={4} value={draft.caption} onChange={(e) => set('caption', e.target.value)} />
      </Field>
      <Field label="CTA">
        <Input value={draft.cta} onChange={(e) => set('cta', e.target.value)} />
      </Field>
      <Field label="Хэштеги">
        <Textarea rows={2} value={draft.hashtags} onChange={(e) => set('hashtags', e.target.value)} />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ContentFeedback contentId={current.id} contentType="reels" />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
