'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Check, Copy, ChevronDown, ChevronRight, Filter, LayoutGrid, Loader2,
  Send, Shuffle, Sparkles, Video, ExternalLink, Calendar,
} from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

type CarouselSlide = { n: number; title: string; body: string }
type ReelsScript = {
  hook: string
  promise: string
  body: Array<{ time: string; text: string }>
  cta: string
  text_on_screen: string[]
  caption: string
  hashtags: string[]
}
type TgPost = { text: string }

type Generations = {
  carousel?: { slides: CarouselSlide[] }
  'reels-new'?: ReelsScript
  'reels-remix'?: ReelsScript
  'tg-post'?: TgPost
}

type MaterialType = 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'

type Material = {
  transcript_id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  types: MaterialType[]
  generations: Generations
}

const TYPE_META: Record<MaterialType, { label: string; icon: typeof LayoutGrid; tone: string }> = {
  carousel: { label: 'Карусель', icon: LayoutGrid, tone: 'bg-blue-50 text-blue-700' },
  'reels-new': { label: 'Reels', icon: Video, tone: 'bg-purple-50 text-purple-700' },
  'reels-remix': { label: 'Reels (ремикс)', icon: Shuffle, tone: 'bg-fuchsia-50 text-fuchsia-700' },
  'tg-post': { label: 'TG-пост', icon: Send, tone: 'bg-sky-50 text-sky-700' },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })
}

function carouselToText(c: { slides: CarouselSlide[] }): string {
  return c.slides.map((s) => `Слайд ${s.n}. ${s.title}\n\n${s.body}`).join('\n\n———\n\n')
}

function reelsToText(r: ReelsScript): string {
  const body = r.body.map((b) => `[${b.time}] ${b.text}`).join('\n')
  const onScreen = r.text_on_screen?.length ? `\n\nНА ЭКРАНЕ:\n${r.text_on_screen.join('\n')}` : ''
  const hashtags = r.hashtags?.length ? `\n\nХЭШТЕГИ: ${r.hashtags.join(' ')}` : ''
  return `HOOK: ${r.hook}\n\nPROMISE: ${r.promise}\n\nBODY:\n${body}\n\nCTA: ${r.cta}${onScreen}\n\nCAPTION:\n${r.caption}${hashtags}`
}

function generationToText(type: MaterialType, g: Generations): string {
  switch (type) {
    case 'carousel': return g.carousel ? carouselToText(g.carousel) : ''
    case 'reels-new': return g['reels-new'] ? reelsToText(g['reels-new']) : ''
    case 'reels-remix': return g['reels-remix'] ? reelsToText(g['reels-remix']) : ''
    case 'tg-post': return g['tg-post']?.text ?? ''
  }
}

export default function MaterialsPage() {
  const [items, setItems] = useState<Material[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MaterialType | 'all'>('all')
  const [expanded, setExpanded] = useState<Record<string, MaterialType | null>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch('/api/transcribe/materials')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (alive) setItems(data.items ?? [])
      })
      .catch((e) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    if (!items) return null
    if (filter === 'all') return items
    return items.filter((m) => m.types.includes(filter))
  }, [items, filter])

  async function copyMaterial(material: Material, type: MaterialType) {
    const text = generationToText(type, material.generations)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      const key = `${material.transcript_id}:${type}`
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500)
    } catch {}
  }

  return (
    <div className="animate-slide-in space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-apple-ink sm:text-[34px]">
          Материалы
        </h1>
        <p className="mt-1 text-[15px] text-apple-muted sm:text-base">
          Карусели, Reels и Telegram-посты, сгенерированные из транскриптов.
        </p>
      </div>

      {/* Filter pills */}
      <nav className="flex flex-wrap gap-1.5">
        {(['all', 'carousel', 'reels-new', 'reels-remix', 'tg-post'] as const).map((t) => {
          const active = filter === t
          const label = t === 'all' ? 'Все' : TYPE_META[t].label
          return (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? 'border-apple-ink bg-apple-ink text-white'
                  : 'border-apple-line bg-white text-apple-muted hover:bg-apple-bg-soft hover:text-apple-ink'
              }`}
            >
              {t === 'all' ? <Filter className="h-3.5 w-3.5" /> : null}
              {label}
            </button>
          )
        })}
      </nav>

      {error && (
        <div className="rounded-apple-lg border border-rose-200 bg-rose-50 p-4 text-[14px] text-rose-700">
          Не удалось загрузить материалы: {error}
        </div>
      )}

      {items === null && !error && (
        <div className="flex items-center gap-2 text-[14px] text-apple-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем…
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div className="rounded-apple-lg border border-dashed border-apple-line bg-apple-bg-soft p-8 text-center">
          <Sparkles className="mx-auto mb-3 h-6 w-6 text-apple-faint" />
          <p className="text-[15px] text-apple-muted">
            Здесь появятся материалы, которые ты сгенерируешь из транскриптов.
          </p>
          <Link
            href="/transcribe"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-white px-3.5 py-1.5 text-[13px] font-medium text-apple-ink shadow-apple-sm hover:bg-apple-bg-soft"
          >
            Перейти к транскрибации
          </Link>
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((m) => {
            const visibleTypes = filter === 'all' ? m.types : m.types.filter((t) => t === filter)
            const currentExpanded = expanded[m.transcript_id] ?? null
            return (
              <li
                key={m.transcript_id}
                className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm"
              >
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-[15px] font-semibold text-apple-ink sm:text-base">
                        {m.title || m.url}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-apple-muted">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(m.created_at)}
                        </span>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 truncate hover:text-apple-ink"
                          title={m.url}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">{m.url.replace(/^https?:\/\//, '')}</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {visibleTypes.map((t) => {
                      const meta = TYPE_META[t]
                      const Icon = meta.icon
                      const isOpen = currentExpanded === t
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [m.transcript_id]: prev[m.transcript_id] === t ? null : t,
                            }))
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                            isOpen ? 'bg-apple-ink text-white' : meta.tone
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {currentExpanded && (
                    <div className="space-y-3 rounded-apple border border-apple-line bg-apple-bg-soft p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-apple-faint">
                          {TYPE_META[currentExpanded].label}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyMaterial(m, currentExpanded)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-white px-2.5 py-1 text-[12px] font-medium text-apple-ink shadow-apple-sm hover:bg-white"
                        >
                          {copiedKey === `${m.transcript_id}:${currentExpanded}` ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                              Скопировано
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Копировать
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-apple-ink">
                        {generationToText(currentExpanded, m.generations) || '— пусто —'}
                      </pre>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
