'use client'
import { useEffect, useRef, useState } from 'react'
import {
  AudioLines, Loader2, Copy, Check, TriangleAlert, Link as LinkIcon,
  Download, FileText, Sparkles, Languages, History, Trash2, ChevronRight, Youtube, FileAudio,
  LayoutGrid, Video, Shuffle, Send,
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
  const isNew = variant === 'new'
  const Icon = isNew ? Video : Shuffle
  const title = isNew ? 'Рилс — новый сценарий' : 'Рилс — ремикс'
  const wrapClasses = isNew
    ? 'bg-fuchsia-500/5 border-fuchsia-500/20'
    : 'bg-pink-500/5 border-pink-500/20'
  const headerClasses = isNew ? 'border-fuchsia-500/10' : 'border-pink-500/10'
  const iconClasses = isNew ? 'text-fuchsia-400' : 'text-pink-400'
  const titleClasses = isNew ? 'text-fuchsia-300' : 'text-pink-300'
  return (
    <div className={`${wrapClasses} border rounded-xl overflow-hidden`}>
      <div className={`px-5 py-3 border-b ${headerClasses} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconClasses}`} />
          <h3 className={`text-xs font-semibold ${titleClasses} uppercase tracking-wider`}>{title}</h3>
        </div>
        <button
          onClick={() => onCopy(formatForCopy(reels))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
        >
          <Copy className="w-3 h-3" /> Копировать всё
        </button>
      </div>
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <Section label="HOOK · 0-3 сек" text={reels.hook} />
        <Section label="PROMISE · 3-7 сек" text={reels.promise} />
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Body</div>
          <div className="space-y-2">
            {reels.body.map((b, i) => (
              <div key={i} className="flex gap-3 bg-slate-900/40 rounded-lg p-3">
                <span className="text-[11px] text-slate-500 font-mono tabular-nums flex-shrink-0 w-16">{b.time}</span>
                <p className="text-sm text-slate-200 leading-relaxed flex-1">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
        <Section label="CTA · 50-60 сек" text={reels.cta} />
        {reels.text_on_screen.length > 0 && (
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Text on screen</div>
            <div className="flex flex-wrap gap-1.5">
              {reels.text_on_screen.map((s, i) => (
                <span key={i} className="text-xs text-slate-300 bg-slate-700/40 px-2 py-1 rounded">{s}</span>
              ))}
            </div>
          </div>
        )}
        <Section label="Caption" text={reels.caption} />
        {reels.hashtags.length > 0 && (
          <div className="text-xs text-indigo-400 font-mono break-words">{reels.hashtags.join(' ')}</div>
        )}
      </div>
    </div>
  )
}

function Section({ label, text }: { label: string; text: string }) {
  if (!text) return null
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</div>
      <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
    </div>
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
    <div className="animate-slide-in space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Транскрибация</h1>
        <p className="text-sm text-slate-500 mt-0.5">YouTube или прямая ссылка → текст, саммари, перевод</p>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2 block">
            URL медиафайла
          </label>
          <div className="relative">
            <LinkIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              placeholder="https://youtube.com/... · https://instagram.com/reel/... · или прямой mp3/mp4"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all font-mono"
            />
          </div>
          <p className="text-[11px] text-slate-600 mt-1.5">
            YouTube · Instagram Reels · TikTok · прямые файлы (mp3, wav, m4a, ogg, mp4, mov, webm).
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2 block">Язык</label>
            <div className="flex gap-1.5">
              {(['ru', 'en', 'auto'] as const).map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    language === lang
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                      : 'bg-slate-900/40 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
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
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all border bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Обрабатываем...
                </>
              ) : (
                <>
                  <AudioLines className="w-4 h-4" />
                  Получить текст
                </>
              )}
            </button>
          )}
        </div>
        {inTg && (
          <p className="text-[11px] text-slate-600 text-center">
            Нажми «Получить текст» внизу экрана
          </p>
        )}
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
          <TriangleAlert className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs text-rose-400 uppercase tracking-wider font-medium mb-1">Ошибка</div>
            <p className="text-sm text-slate-300 break-words">{error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Transcript card */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Транскрипт</h3>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                  {result.source === 'youtube' ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400">
                      <Youtube className="w-3 h-3" /> YouTube
                    </span>
                  ) : result.source === 'ytdlp+deepgram' ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                      <FileAudio className="w-3 h-3" /> yt-dlp + Deepgram
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                      <FileAudio className="w-3 h-3" /> Deepgram
                    </span>
                  )}
                  {result.duration !== null && <span>{formatTime(result.duration)}</span>}
                  {result.detectedLanguage && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400 uppercase">
                      {result.detectedLanguage}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={copyTranscript} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all">
                  {copied ? (<><Check className="w-3 h-3 text-emerald-400" /> Скопировано</>) : (<><Copy className="w-3 h-3" /> Копировать</>)}
                </button>
                <button onClick={exportTxt} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all">
                  <Download className="w-3 h-3" /> .txt
                </button>
                <button
                  onClick={exportSrt}
                  disabled={result.paragraphs.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText className="w-3 h-3" /> .srt
                </button>
              </div>
            </div>
            <div className="p-5 max-h-[50vh] overflow-y-auto">
              {result.paragraphs.length > 0 ? (
                <div className="space-y-4">
                  {result.paragraphs.map((p, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-[11px] text-slate-600 font-mono tabular-nums flex-shrink-0 pt-0.5 w-14">
                        {formatTime(p.start)}
                      </span>
                      <p className="text-sm text-slate-200 leading-relaxed flex-1">{p.text}</p>
                    </div>
                  ))}
                </div>
              ) : result.transcript ? (
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{result.transcript}</p>
              ) : (
                <p className="text-sm text-slate-500 italic">Пустой результат</p>
              )}
            </div>
          </div>

          {/* AI actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateSummary}
              disabled={summaryLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border bg-violet-600/15 border-violet-500/30 text-violet-300 hover:bg-violet-600/25 disabled:opacity-50"
            >
              {summaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Сгенерировать саммари
            </button>
            <button
              onClick={() => translateTo(otherLang)}
              disabled={translationLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border bg-emerald-600/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/25 disabled:opacity-50"
            >
              {translationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
              Перевести на {otherLang === 'ru' ? 'русский' : 'английский'}
            </button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Саммари</h3>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed mb-3">{summary.summary}</p>
              <ul className="space-y-1.5">
                {summary.bullets.map((b, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-violet-400 flex-shrink-0">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Translation */}
          {translation && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-emerald-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                    Перевод на {translation.lang === 'ru' ? 'русский' : 'английский'}
                  </h3>
                </div>
                <button
                  onClick={() => copyText(translation.text)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
                >
                  <Copy className="w-3 h-3" /> Копировать
                </button>
              </div>
              <div className="p-5 max-h-[50vh] overflow-y-auto">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{translation.text}</p>
              </div>
            </div>
          )}

          {/* Content generation actions */}
          <div className="border-t border-slate-800 pt-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">
              Превратить в контент
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => generate('carousel')}
                disabled={genLoading === 'carousel'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border bg-cyan-600/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-600/25 disabled:opacity-50"
              >
                {genLoading === 'carousel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutGrid className="w-4 h-4" />}
                Карусель
              </button>
              <button
                onClick={() => generate('reels-new')}
                disabled={genLoading === 'reels-new'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border bg-fuchsia-600/15 border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-600/25 disabled:opacity-50"
              >
                {genLoading === 'reels-new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                Рилс новый
              </button>
              <button
                onClick={() => generate('reels-remix')}
                disabled={genLoading === 'reels-remix'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border bg-pink-600/15 border-pink-500/30 text-pink-300 hover:bg-pink-600/25 disabled:opacity-50"
              >
                {genLoading === 'reels-remix' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
                Рилс ремикс
              </button>
              <button
                onClick={() => generate('tg-post')}
                disabled={genLoading === 'tg-post'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border bg-sky-600/15 border-sky-500/30 text-sky-300 hover:bg-sky-600/25 disabled:opacity-50"
              >
                {genLoading === 'tg-post' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Пост в Telegram
              </button>
            </div>
          </div>

          {/* Carousel */}
          {generations.carousel && (
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-cyan-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                    Карусель · {generations.carousel.slides.length} слайдов
                  </h3>
                </div>
                <button
                  onClick={() => copyText(formatCarouselForCopy(generations.carousel!))}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
                >
                  <Copy className="w-3 h-3" /> Копировать всё
                </button>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                {generations.carousel.slides.map(slide => (
                  <div key={slide.n} className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4 relative group">
                    <div className="absolute top-2 right-2 text-[10px] text-slate-600 font-mono">#{slide.n}</div>
                    <div className="text-sm font-semibold text-slate-100 mb-2 pr-8">{slide.title}</div>
                    <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{slide.body}</div>
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
            <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-sky-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-sky-400" />
                  <h3 className="text-xs font-semibold text-sky-300 uppercase tracking-wider">
                    Пост в Telegram · {generations['tg-post'].text.length} символов
                  </h3>
                </div>
                <button
                  onClick={() => copyText(generations['tg-post']!.text)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
                >
                  <Copy className="w-3 h-3" /> Копировать
                </button>
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{generations['tg-post'].text}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {historyConfigured && history.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/40 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">История</h3>
            <span className="text-[10px] text-slate-600">({history.length})</span>
          </div>
          <div className="divide-y divide-slate-700/30 max-h-[60vh] overflow-y-auto">
            {history.map(item => (
              <button
                key={item.id}
                onClick={() => loadFromHistory(item.id)}
                className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-700/20 transition-colors text-left group"
              >
                <div className="flex-shrink-0 mt-1">
                  {item.source === 'youtube' ? (
                    <Youtube className="w-4 h-4 text-rose-400" />
                  ) : (
                    <FileAudio className="w-4 h-4 text-indigo-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">{item.title || item.url}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
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
                  className="flex-shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                  title="Удалить"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 mt-1.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {!historyConfigured && (
        <div className="text-[11px] text-slate-600 px-1">
          История транскриптов выключена — добавьте <code className="text-slate-500">NEXT_PUBLIC_SUPABASE_URL</code> и <code className="text-slate-500">SUPABASE_SERVICE_KEY</code>, а также выполните миграцию <code className="text-slate-500">supabase/migrations/001_transcripts.sql</code>.
        </div>
      )}
    </div>
  )
}
