'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AudioLines, Loader2, Copy, Check, TriangleAlert, Link as LinkIcon,
  Download, FileText, Sparkles, Languages, History, Trash2, ChevronRight, Youtube, FileAudio,
  LayoutGrid, Video, Shuffle, Send, Bot, Brain,
} from 'lucide-react'
import { getTelegram, isInTelegram } from '@/lib/telegram'
import { apiFetch } from '@/lib/api-client'
import MarkdownMessage from '@/components/MarkdownMessage'
import { readNdjson } from '@/lib/stream-client'

type Paragraph = { text: string; start: number; end: number }
type Source = 'youtube' | 'deepgram' | 'ytdlp+deepgram'
type Result = {
  id: string | null
  transcript: string
  paragraphs: Paragraph[]
  duration: number | null
  detectedLanguage: string | null
  source: Source
}
type Summary = { markdown: string }
type Translation = { text: string; lang: 'ru' | 'en' }

type CarouselContent = { slides: Array<{ n: number; title: string; body: string }> }
type ReelsContent = {
  hook: string
  promise: string
  body: Array<{ time: string; text: string }>
  cta: string
  text_on_screen: string[]
  caption: string
  hashtags: string[]
}
type TgPostContent = { text: string }

type GenType = 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'
type Generations = {
  carousel?: CarouselContent
  'reels-new'?: ReelsContent
  'reels-remix'?: ReelsContent
  'tg-post'?: TgPostContent
}

type HistoryItem = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
  in_brain: 0 | 1
}

function formatTime(sec: number) {
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

function formatSrtTime(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec - Math.floor(sec)) * 1000)
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

function buildSrt(paragraphs: Paragraph[]): string {
  return paragraphs
    .map(
      (p, i) =>
        `${i + 1}\n${formatSrtTime(p.start)} --> ${formatSrtTime(p.end)}\n${p.text}\n`,
    )
    .join('\n')
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(s: string | null, fallback = 'transcript'): string {
  if (!s) return fallback
  return s
    .replace(/[^a-zA-Zа-яА-Я0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || fallback
}

function ReelsCard({
  reels,
  variant,
  onCopy,
  formatForCopy,
}: {
  reels: ReelsContent
  variant: 'new' | 'remix'
  onCopy: (text: string) => void
  formatForCopy: (r: ReelsContent) => string
}) {
  const Icon = variant === 'new' ? Video : Shuffle
  const title = variant === 'new' ? 'Рилс — новый сценарий' : 'Рилс — ремикс'
  return (
    <div className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
      <div className="flex items-center justify-between gap-2 border-b border-apple-line px-5 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-apple-muted" />
          <h3 className="text-[13px] font-semibold text-apple-ink">{title}</h3>
        </div>
        <SoftButton onClick={() => onCopy(formatForCopy(reels))} icon={<Copy className="h-3.5 w-3.5" />}>
          Копировать всё
        </SoftButton>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
        <Section label="HOOK · 0-3 сек" text={reels.hook} />
        <Section label="PROMISE · 3-7 сек" text={reels.promise} />
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-apple-faint">Body</div>
          <div className="space-y-2">
            {reels.body.map((b, i) => (
              <div key={i} className="flex gap-3 rounded-xl bg-apple-bg-soft p-3">
                <span className="w-16 flex-shrink-0 font-mono text-[12px] tabular-nums text-apple-faint">{b.time}</span>
                <p className="flex-1 text-[14px] leading-relaxed text-apple-ink">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
        <Section label="CTA · 50-60 сек" text={reels.cta} />
        {reels.text_on_screen.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-apple-faint">Text on screen</div>
            <div className="flex flex-wrap gap-1.5">
              {reels.text_on_screen.map((s, i) => (
                <span key={i} className="rounded-md bg-apple-bg-soft px-2 py-1 text-[13px] text-apple-ink">{s}</span>
              ))}
            </div>
          </div>
        )}
        <Section label="Caption" text={reels.caption} />
        {reels.hashtags.length > 0 && (
          <div className="break-words font-mono text-[13px] text-apple-blue">{reels.hashtags.join(' ')}</div>
        )}
      </div>
    </div>
  )
}

function Section({ label, text }: { label: string; text: string }) {
  if (!text) return null
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-apple-faint">{label}</div>
      <p className="text-[14px] leading-relaxed text-apple-ink">{text}</p>
    </div>
  )
}

function SoftButton({
  onClick,
  icon,
  disabled,
  children,
}: {
  onClick?: () => void
  icon?: React.ReactNode
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-white px-3 py-1.5 text-[12px] font-medium text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  )
}

function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000
  if (sec < 60) return 'только что'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  return `${d} дн назад`
}

export default function TranscribePage() {
  const [url, setUrl] = useState('')
  const [language, setLanguage] = useState<'auto' | 'ru' | 'en'>('ru')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importedAt, setImportedAt] = useState<string | null>(null)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [translation, setTranslation] = useState<Translation | null>(null)
  const [translationLoading, setTranslationLoading] = useState(false)

  const [generations, setGenerations] = useState<Generations>({})
  const [genLoading, setGenLoading] = useState<GenType | null>(null)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyConfigured, setHistoryConfigured] = useState(true)
  const [historySelection, setHistorySelection] = useState<Set<string>>(new Set())
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchSummary, setBatchSummary] = useState<string | null>(null)
  const [historyQuery, setHistoryQuery] = useState('')

  const [inTg, setInTg] = useState(false)
  const submitRef = useRef<() => void>(() => {})

  async function loadHistory() {
    try {
      const res = await apiFetch('/api/transcribe/history')
      const data = await res.json()
      setHistory(data.items ?? [])
      setHistoryConfigured(data.configured !== false)
    } catch {}
  }

  useEffect(() => {
    loadHistory()
    setInTg(isInTelegram())
  }, [])

  // Sync Telegram MainButton with form state
  useEffect(() => {
    const tg = getTelegram()
    if (!tg) return
    const btn = tg.MainButton
    btn.setText(loading ? 'Обрабатываем…' : 'Получить текст')
    if (loading) btn.showProgress(false)
    else btn.hideProgress()
    if (!url.trim() || loading) btn.disable()
    else btn.enable()
    btn.show()

    const handler = () => submitRef.current()
    btn.onClick(handler)
    return () => {
      btn.offClick(handler)
      btn.hide()
    }
  }, [url, loading])

  function resetSecondary() {
    setSummary(null)
    setTranslation(null)
    setGenerations({})
  }

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!url.trim() || loading) return
    const tg = getTelegram()
    tg?.HapticFeedback.impactOccurred('light')
    setError(null)
    setResult(null)
    resetSecondary()
    setLoading(true)
    try {
      const res = await apiFetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), language }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось получить транскрипт')
        tg?.HapticFeedback.notificationOccurred('error')
      } else {
        setResult(data)
        loadHistory()
        tg?.HapticFeedback.notificationOccurred('success')
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
      tg?.HapticFeedback.notificationOccurred('error')
    } finally {
      setLoading(false)
    }
  }

  // Keep latest submit() in a ref so the MainButton onClick handler
  // always calls the current closure (with up-to-date url/language).
  useEffect(() => {
    submitRef.current = () => submit()
  })

  async function loadFromHistory(id: string) {
    setError(null)
    resetSecondary()
    setLoading(true)
    try {
      const res = await apiFetch(`/api/transcribe/history/${id}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось загрузить транскрипт')
      } else {
        setResult({
          id: data.id,
          transcript: data.transcript,
          paragraphs: data.paragraphs ?? [],
          duration: data.duration,
          detectedLanguage: data.language,
          source: data.source,
        })
        if (data.summary || (data.bullets && data.bullets.length > 0)) {
          const bulletsMd = (data.bullets ?? []).map((b: string) => `- ${b}`).join('\n')
          const md =
            (data.summary ? `## Саммари\n${data.summary}` : '') +
            (bulletsMd ? (data.summary ? '\n\n' : '') + `## Тезисы\n${bulletsMd}` : '')
          setSummary({ markdown: md })
        }
        if (data.translation) {
          setTranslation({ text: data.translation.text, lang: data.translation.lang })
        }
        if (data.generations) {
          setGenerations(data.generations)
        }
        setUrl(data.url)
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function deleteHistoryItem(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Удалить этот транскрипт?')) return
    try {
      await apiFetch(`/api/transcribe/history/${id}`, { method: 'DELETE' })
      loadHistory()
      if (result?.id === id) {
        setResult(null)
        resetSecondary()
      }
    } catch {}
  }

  function toggleHistorySelection(id: string) {
    setHistorySelection(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setBatchSummary(null)
  }

  function clearHistorySelection() {
    setHistorySelection(new Set())
    setBatchSummary(null)
  }

  async function batchImportToBrain() {
    if (batchImporting || historySelection.size === 0) return
    setBatchImporting(true)
    setBatchSummary(null)
    setError(null)
    try {
      const ids = Array.from(historySelection)
      const res = await apiFetch('/api/me/documents/import-transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      const s = data.summary || { imported: 0, failed: 0, total: ids.length }
      const parts = [`Добавлено в Базу: ${s.imported} из ${s.total}`]
      if (s.failed > 0) parts.push(`не смог: ${s.failed}`)
      setBatchSummary(parts.join(' · '))
      setHistorySelection(new Set())
    } catch (e: any) {
      setError(e?.message || 'Не удалось импортировать')
    } finally {
      setBatchImporting(false)
    }
  }

  async function importToBrain() {
    if (!result || importing) return
    const text = result.paragraphs.length
      ? result.paragraphs.map(p => p.text).join('\n\n')
      : result.transcript
    if (!text.trim()) return
    setImporting(true)
    setError(null)
    try {
      const titleSeed = text.trim().slice(0, 80).replace(/\s+/g, ' ')
      const res = await apiFetch('/api/me/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleSeed + (text.length > 80 ? '…' : ''),
          text,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setImportedAt(result.id)
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить в базу')
    } finally {
      setImporting(false)
    }
  }

  async function copyTranscript() {
    if (!result) return
    const text = result.paragraphs.length
      ? result.paragraphs.map(p => p.text).join('\n\n')
      : result.transcript
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function exportTxt() {
    if (!result) return
    const text = result.paragraphs.length
      ? result.paragraphs.map(p => p.text).join('\n\n')
      : result.transcript
    downloadFile(text, `${safeFilename(result.transcript.slice(0, 40))}.txt`, 'text/plain')
  }

  function exportSrt() {
    if (!result || result.paragraphs.length === 0) return
    downloadFile(buildSrt(result.paragraphs), `${safeFilename(result.transcript.slice(0, 40))}.srt`, 'text/plain')
  }

  async function generateSummary() {
    if (!result) return
    setSummaryLoading(true)
    setSummary({ markdown: '' })
    setError(null)
    try {
      const res = await apiFetch('/api/transcribe/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, transcript: result.transcript }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      let acc = ''
      let streamError: string | null = null
      await readNdjson(res, (e) => {
        if (e.type === 'delta') {
          acc += e.text
          setSummary({ markdown: acc })
        } else if (e.type === 'error') {
          streamError = e.error
        }
      })
      if (streamError) throw new Error(streamError)
      if (!acc.trim()) throw new Error('Пустой ответ от модели')
      setSummary({ markdown: acc })
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  async function translateTo(targetLang: 'ru' | 'en') {
    if (!result) return
    setTranslationLoading(true)
    setTranslation({ text: '', lang: targetLang })
    setError(null)
    try {
      const res = await apiFetch('/api/transcribe/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, transcript: result.transcript, targetLang }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      let acc = ''
      let streamError: string | null = null
      await readNdjson(res, (e) => {
        if (e.type === 'delta') {
          acc += e.text
          setTranslation({ text: acc, lang: targetLang })
        } else if (e.type === 'error') {
          streamError = e.error
        }
      })
      if (streamError) throw new Error(streamError)
      if (!acc.trim()) throw new Error('Пустой ответ от модели')
      setTranslation({ text: acc, lang: targetLang })
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
      setTranslation(null)
    } finally {
      setTranslationLoading(false)
    }
  }

  async function generate(type: GenType) {
    if (!result) return
    setGenLoading(type)
    setGenerations(prev => ({ ...prev, [type]: undefined }))
    try {
      const res = await apiFetch('/api/transcribe/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, transcript: result.transcript, type }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось сгенерировать контент')
      } else {
        setGenerations(prev => ({ ...prev, [type]: data.content }))
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
    } finally {
      setGenLoading(null)
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text)
  }

  function formatCarouselForCopy(c: CarouselContent): string {
    return c.slides.map(s => `Слайд ${s.n}: ${s.title}\n${s.body}`).join('\n\n')
  }

  function formatReelsForCopy(r: ReelsContent): string {
    const bodyText = r.body.map(b => `[${b.time}] ${b.text}`).join('\n')
    const onScreen = r.text_on_screen.length ? `\nText on screen:\n${r.text_on_screen.map(s => `• ${s}`).join('\n')}` : ''
    const hashtags = r.hashtags.length ? `\n\n${r.hashtags.join(' ')}` : ''
    return `HOOK: ${r.hook}\n\nPROMISE: ${r.promise}\n\nBODY:\n${bodyText}\n\nCTA: ${r.cta}${onScreen}\n\nCAPTION:\n${r.caption}${hashtags}`
  }

  const otherLang: 'ru' | 'en' = result?.detectedLanguage === 'en' ? 'ru' : 'en'

  return (
    <div className="animate-slide-in space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-apple-ink sm:text-[34px]">
            Транскрибация
          </h1>
          <p className="mt-1 text-[15px] text-apple-muted sm:text-base">
            YouTube или прямая ссылка → текст, саммари, перевод
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-white px-3 py-1.5 text-[13px] font-medium text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft"
            title="Второй мозг"
          >
            <Brain className="h-4 w-4" />
            Я
          </Link>
          <Link
            href="/assistants"
            className="inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-white px-3 py-1.5 text-[13px] font-medium text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft"
            title="ИИ-ассистенты"
          >
            <Bot className="h-4 w-4" />
            Ассистенты
          </Link>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="space-y-4 rounded-apple-lg border border-apple-line bg-white p-5 shadow-apple-sm">
        <div>
          <label className="mb-2 block text-[12px] font-medium text-apple-muted">
            URL медиафайла
          </label>
          <div className="relative">
            <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-apple-faint" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              placeholder="https://youtube.com/... · https://instagram.com/reel/... · mp3/mp4"
              className="w-full rounded-xl border border-apple-line bg-apple-bg-soft py-2.5 pl-10 pr-3 text-[14px] text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white focus:shadow-apple-sm"
            />
          </div>
          <p className="mt-2 text-[12px] text-apple-faint">
            YouTube · Instagram Reels · TikTok · прямые файлы (mp3, wav, m4a, ogg, mp4, mov, webm)
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-2 block text-[12px] font-medium text-apple-muted">Язык</label>
            <div className="inline-flex rounded-full bg-apple-bg-soft p-0.5">
              {(['ru', 'en', 'auto'] as const).map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                    language === lang
                      ? 'bg-white text-apple-ink shadow-apple-sm'
                      : 'text-apple-muted hover:text-apple-ink'
                  }`}
                >
                  {lang === 'ru' ? 'Русский' : lang === 'en' ? 'English' : 'Авто'}
                </button>
              ))}
            </div>
          </div>
          {!inTg && (
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-apple-blue px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-apple-blue-hover active:bg-apple-blue-pressed disabled:cursor-not-allowed disabled:bg-apple-line-strong"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Обрабатываем…
                </>
              ) : (
                <>
                  <AudioLines className="h-4 w-4" />
                  Получить текст
                </>
              )}
            </button>
          )}
        </div>
        {inTg && (
          <p className="text-center text-[12px] text-apple-faint">
            Нажми «Получить текст» внизу экрана
          </p>
        )}
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-apple-lg border border-red-200 bg-red-50 p-4">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <div>
            <div className="mb-0.5 text-[12px] font-medium text-red-700">Ошибка</div>
            <p className="break-words text-[14px] text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-5">
          {/* Transcript card */}
          <div className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-apple-line px-5 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-[13px] font-semibold text-apple-ink">Транскрипт</h3>
                <div className="flex items-center gap-1.5 text-[11px] text-apple-faint">
                  {result.source === 'youtube' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-apple-bg-soft px-1.5 py-0.5 text-apple-muted">
                      <Youtube className="h-3 w-3" /> YouTube
                    </span>
                  ) : result.source === 'ytdlp+deepgram' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-apple-bg-soft px-1.5 py-0.5 text-apple-muted">
                      <FileAudio className="h-3 w-3" /> yt-dlp + Deepgram
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-apple-bg-soft px-1.5 py-0.5 text-apple-muted">
                      <FileAudio className="h-3 w-3" /> Deepgram
                    </span>
                  )}
                  {result.duration !== null && <span>{formatTime(result.duration)}</span>}
                  {result.detectedLanguage && (
                    <span className="rounded-md bg-apple-bg-soft px-1.5 py-0.5 uppercase text-apple-muted">
                      {result.detectedLanguage}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <SoftButton onClick={copyTranscript} icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}>
                  {copied ? 'Скопировано' : 'Копировать'}
                </SoftButton>
                <SoftButton onClick={exportTxt} icon={<Download className="h-3.5 w-3.5" />}>.txt</SoftButton>
                <SoftButton onClick={exportSrt} disabled={result.paragraphs.length === 0} icon={<FileText className="h-3.5 w-3.5" />}>.srt</SoftButton>
                <SoftButton
                  onClick={importToBrain}
                  disabled={importing || importedAt === result.id}
                  icon={importedAt === result.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                >
                  {importedAt === result.id ? 'В базе' : importing ? 'Сохраняем' : 'В мой мозг'}
                </SoftButton>
              </div>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-5">
              {result.paragraphs.length > 0 ? (
                <div className="space-y-4">
                  {result.paragraphs.map((p, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="w-14 flex-shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-apple-faint">
                        {formatTime(p.start)}
                      </span>
                      <p className="flex-1 text-[15px] leading-relaxed text-apple-ink">{p.text}</p>
                    </div>
                  ))}
                </div>
              ) : result.transcript ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-apple-ink">{result.transcript}</p>
              ) : (
                <p className="italic text-apple-faint">Пустой результат</p>
              )}
            </div>
          </div>

          {/* AI actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateSummary}
              disabled={summaryLoading}
              className="inline-flex items-center gap-2 rounded-full border border-apple-line bg-white px-4 py-2 text-[14px] font-medium text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft disabled:opacity-50"
            >
              {summaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-apple-blue" />}
              Сгенерировать саммари
            </button>
            <button
              onClick={() => translateTo(otherLang)}
              disabled={translationLoading}
              className="inline-flex items-center gap-2 rounded-full border border-apple-line bg-white px-4 py-2 text-[14px] font-medium text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft disabled:opacity-50"
            >
              {translationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4 text-apple-blue" />}
              Перевести на {otherLang === 'ru' ? 'русский' : 'английский'}
            </button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="rounded-apple-lg border border-apple-line bg-white p-5 shadow-apple-sm">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-apple-blue" />
                <h3 className="text-[13px] font-semibold text-apple-ink">Саммари</h3>
              </div>
              {summary.markdown ? (
                <MarkdownMessage content={summary.markdown} className="text-[15px] leading-relaxed text-apple-ink" />
              ) : (
                <span className="flex items-center gap-1 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          )}

          {/* Translation */}
          {translation && (
            <div className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
              <div className="flex items-center justify-between border-b border-apple-line px-5 py-3">
                <div className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-apple-blue" />
                  <h3 className="text-[13px] font-semibold text-apple-ink">
                    Перевод на {translation.lang === 'ru' ? 'русский' : 'английский'}
                  </h3>
                </div>
                <SoftButton onClick={() => copyText(translation.text)} icon={<Copy className="h-3.5 w-3.5" />}>
                  Копировать
                </SoftButton>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-5">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-apple-ink">{translation.text}</p>
              </div>
            </div>
          )}

          {/* Content generation actions */}
          <div className="border-t border-apple-line pt-5">
            <div className="mb-3 text-[12px] font-medium text-apple-muted">
              Превратить в контент
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ['carousel', 'Карусель', LayoutGrid] as const,
                ['reels-new', 'Рилс новый', Video] as const,
                ['reels-remix', 'Рилс ремикс', Shuffle] as const,
                ['tg-post', 'Пост в Telegram', Send] as const,
              ]).map(([t, label, Ico]) => (
                <button
                  key={t}
                  onClick={() => generate(t)}
                  disabled={genLoading === t}
                  className="inline-flex items-center gap-2 rounded-full border border-apple-line bg-white px-4 py-2 text-[14px] font-medium text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft disabled:opacity-50"
                >
                  {genLoading === t ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ico className="h-4 w-4 text-apple-blue" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Carousel */}
          {generations.carousel && (
            <div className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
              <div className="flex items-center justify-between border-b border-apple-line px-5 py-3">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-apple-blue" />
                  <h3 className="text-[13px] font-semibold text-apple-ink">
                    Карусель · {generations.carousel.slides.length} слайдов
                  </h3>
                </div>
                <SoftButton
                  onClick={() => copyText(formatCarouselForCopy(generations.carousel!))}
                  icon={<Copy className="h-3.5 w-3.5" />}
                >
                  Копировать всё
                </SoftButton>
              </div>
              <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto p-5 md:grid-cols-2">
                {generations.carousel.slides.map(slide => (
                  <div key={slide.n} className="relative rounded-xl border border-apple-line bg-apple-bg-elev p-4">
                    <div className="absolute right-3 top-2 font-mono text-[11px] text-apple-faint">#{slide.n}</div>
                    <div className="mb-2 pr-8 text-[15px] font-semibold text-apple-ink">{slide.title}</div>
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-apple-muted">{slide.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reels new */}
          {generations['reels-new'] && (
            <ReelsCard reels={generations['reels-new']} variant="new" onCopy={copyText} formatForCopy={formatReelsForCopy} />
          )}

          {/* Reels remix */}
          {generations['reels-remix'] && (
            <ReelsCard reels={generations['reels-remix']} variant="remix" onCopy={copyText} formatForCopy={formatReelsForCopy} />
          )}

          {/* Telegram post */}
          {generations['tg-post'] && (
            <div className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
              <div className="flex items-center justify-between border-b border-apple-line px-5 py-3">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-apple-blue" />
                  <h3 className="text-[13px] font-semibold text-apple-ink">
                    Пост в Telegram · {generations['tg-post'].text.length} символов
                  </h3>
                </div>
                <SoftButton onClick={() => copyText(generations['tg-post']!.text)} icon={<Copy className="h-3.5 w-3.5" />}>
                  Копировать
                </SoftButton>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-5">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-apple-ink">{generations['tg-post'].text}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {historyConfigured && history.length > 0 && (
        <div className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-apple-line px-5 py-3">
            <History className="h-4 w-4 text-apple-muted" />
            <h3 className="text-[13px] font-semibold text-apple-ink">История</h3>
            <span className="text-[12px] text-apple-faint">({history.length})</span>
            {historySelection.size > 0 && (
              <>
                <span className="ml-auto text-[12px] text-apple-muted">
                  выбрано: {historySelection.size}
                </span>
                <button
                  type="button"
                  onClick={clearHistorySelection}
                  className="rounded-full px-2.5 py-1 text-[12px] text-apple-muted hover:bg-apple-bg-soft hover:text-apple-ink"
                >
                  Сбросить
                </button>
                <button
                  type="button"
                  onClick={batchImportToBrain}
                  disabled={batchImporting}
                  className="inline-flex items-center gap-1.5 rounded-full bg-apple-blue px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:bg-apple-line-strong"
                >
                  {batchImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Эмбеддим…
                    </>
                  ) : (
                    <>
                      <Brain className="h-3.5 w-3.5" />
                      В мой мозг ({historySelection.size})
                    </>
                  )}
                </button>
              </>
            )}
          </div>
          {batchSummary && (
            <div className="border-b border-apple-line bg-apple-bg-elev px-5 py-2 text-[12px] text-apple-muted">
              {batchSummary}
            </div>
          )}
          <div className="border-b border-apple-line bg-white px-5 py-2">
            <input
              type="text"
              value={historyQuery}
              onChange={e => setHistoryQuery(e.target.value)}
              placeholder="Поиск по истории…"
              className="w-full rounded-full border border-apple-line bg-apple-bg-soft px-3 py-1.5 text-[12px] text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white"
            />
          </div>
          <div className="max-h-[60vh] divide-y divide-apple-line overflow-y-auto">
            {(() => {
              const q = historyQuery.trim().toLowerCase()
              const filtered = q
                ? history.filter(it =>
                    (it.title || '').toLowerCase().includes(q) || it.url.toLowerCase().includes(q),
                  )
                : history
              if (filtered.length === 0) {
                return (
                  <div className="p-6 text-center text-[13px] text-apple-faint">
                    Ничего не нашлось по запросу.
                  </div>
                )
              }
              return filtered.map(item => {
              const selected = historySelection.has(item.id)
              return (
                <div key={item.id} className="group flex items-stretch">
                  <label
                    className="flex shrink-0 cursor-pointer items-center pl-5 pr-2"
                    title="Отметить для импорта в Базу"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleHistorySelection(item.id)}
                      className="h-4 w-4 cursor-pointer accent-apple-blue"
                      onClick={e => e.stopPropagation()}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => loadFromHistory(item.id)}
                    className="flex flex-1 items-start gap-3 py-3 pr-2 text-left transition-colors hover:bg-apple-bg-soft"
                  >
                    <div className="mt-1 flex-shrink-0 text-apple-muted">
                      {item.source === 'youtube' ? (
                        <Youtube className="h-4 w-4" />
                      ) : (
                        <FileAudio className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate text-[14px] text-apple-ink">{item.title || item.url}</div>
                        {item.in_brain ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                            title="Уже в Базе мозга"
                          >
                            <Brain className="h-2.5 w-2.5" />
                            в базе
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-apple-faint">
                        <span>{timeAgo(item.created_at)}</span>
                        {item.duration && <span>· {formatTime(item.duration)}</span>}
                        {item.language && <span>· {item.language}</span>}
                      </div>
                    </div>
                    <ChevronRight className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-apple-faint" />
                  </button>
                  <button
                    type="button"
                    onClick={e => deleteHistoryItem(item.id, e)}
                    className="my-auto mr-3 rounded-full p-1.5 text-apple-faint opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Удалить"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })
            })()}
          </div>
        </div>
      )}

      {!historyConfigured && (
        <p className="px-1 text-[12px] text-apple-faint">
          История транскриптов недоступна — проверь, что <code className="rounded bg-apple-bg-soft px-1 py-0.5 text-apple-muted">DB_PATH</code> указывает на доступный файл и папка <code className="rounded bg-apple-bg-soft px-1 py-0.5 text-apple-muted">./data</code> писабельна.
        </p>
      )}
    </div>
  )
}
