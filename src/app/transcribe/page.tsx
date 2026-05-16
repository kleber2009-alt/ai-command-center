'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AudioLines, Loader2, Copy, Check, TriangleAlert, Link as LinkIcon,
  Download, FileText, Sparkles, Languages, History, Trash2, ChevronRight, Youtube, FileAudio,
  LayoutGrid, Video, Shuffle, Send, Bot, Brain,
} from 'lucide-react'
import { getTelegram, isInTelegram } from '@/lib/telegram'

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
type Summary = { summary: string; bullets: string[] }
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

type Artifact = 'summary' | 'translation' | 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'

type HistoryItem = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
  artifacts: Artifact[]
}

const ARTIFACT_LABELS: Record<Artifact, { label: string; color: string }> = {
  summary:       { label: 'саммари',    color: 'bg-violet-500/10 text-violet-300 border-violet-500/20' },
  translation:   { label: 'перевод',    color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  carousel:      { label: 'карусель',   color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' },
  'reels-new':   { label: 'рилс',       color: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20' },
  'reels-remix': { label: 'рилс-ремикс', color: 'bg-pink-500/10 text-pink-300 border-pink-500/20' },
  'tg-post':     { label: 'TG-пост',    color: 'bg-sky-500/10 text-sky-300 border-sky-500/20' },
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

  const [inTg, setInTg] = useState(false)
  const submitRef = useRef<() => void>(() => {})

  async function loadHistory() {
    try {
      const res = await fetch('/api/transcribe/history')
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
      const res = await fetch('/api/transcribe', {
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
      const res = await fetch(`/api/transcribe/history/${id}`)
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
        if (data.summary && data.bullets) {
          setSummary({ summary: data.summary, bullets: data.bullets })
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
      await fetch(`/api/transcribe/history/${id}`, { method: 'DELETE' })
      loadHistory()
      if (result?.id === id) {
        setResult(null)
        resetSecondary()
      }
    } catch {}
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
      const res = await fetch('/api/me/documents', {
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
    setSummary(null)
    try {
      const res = await fetch('/api/transcribe/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, transcript: result.transcript }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось сгенерировать саммари')
      } else {
        setSummary({ summary: data.summary, bullets: data.bullets })
        loadHistory()
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function translateTo(targetLang: 'ru' | 'en') {
    if (!result) return
    setTranslationLoading(true)
    setTranslation(null)
    try {
      const res = await fetch('/api/transcribe/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, transcript: result.transcript, targetLang }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось перевести')
      } else {
        setTranslation({ text: data.translation, lang: data.lang })
        loadHistory()
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
    } finally {
      setTranslationLoading(false)
    }
  }

  async function generate(type: GenType) {
    if (!result) return
    setGenLoading(type)
    setGenerations(prev => ({ ...prev, [type]: undefined }))
    try {
      const res = await fetch('/api/transcribe/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, transcript: result.transcript, type }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось сгенерировать контент')
      } else {
        setGenerations(prev => ({ ...prev, [type]: data.content }))
        loadHistory()
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
              <p className="mb-3 text-[15px] leading-relaxed text-apple-ink">{summary.summary}</p>
              <ul className="space-y-1.5">
                {summary.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-[14px] text-apple-ink">
                    <span className="flex-shrink-0 text-apple-blue">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
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
          <div className="flex items-center gap-2 border-b border-apple-line px-5 py-3">
            <History className="h-4 w-4 text-apple-muted" />
            <h3 className="text-[13px] font-semibold text-apple-ink">История</h3>
            <span className="text-[12px] text-apple-faint">({history.length})</span>
          </div>
          <div className="max-h-[60vh] divide-y divide-apple-line overflow-y-auto">
            {history.map(item => (
              <button
                key={item.id}
                onClick={() => loadFromHistory(item.id)}
                className="group flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-apple-bg-soft"
              >
                <div className="mt-1 flex-shrink-0 text-apple-muted">
                  {item.source === 'youtube' ? (
                    <Youtube className="h-4 w-4" />
                  ) : (
                    <FileAudio className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-apple-ink">{item.title || item.url}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-apple-faint">
                    <span>{timeAgo(item.created_at)}</span>
                    {item.duration && <span>· {formatTime(item.duration)}</span>}
                    {item.language && <span>· {item.language}</span>}
                  </div>
                  {item.artifacts && item.artifacts.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.artifacts.map(a => (
                        <span
                          key={a}
                          className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border ${ARTIFACT_LABELS[a].color}`}
                        >
                          {ARTIFACT_LABELS[a].label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={e => deleteHistoryItem(item.id, e)}
                  className="flex-shrink-0 rounded-full p-1.5 text-apple-faint opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  title="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <ChevronRight className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-apple-faint" />
              </button>
            ))}
          </div>
        </div>
      )}

      {!historyConfigured && (
        <p className="px-1 text-[12px] text-apple-faint">
          История транскриптов выключена — задайте <code className="rounded bg-apple-bg-soft px-1 py-0.5 text-apple-muted">DATABASE_URL</code> и применит схему <code className="rounded bg-apple-bg-soft px-1 py-0.5 text-apple-muted">db/init/01_schema.sql</code>.
        </p>
      )}
    </div>
  )
}
