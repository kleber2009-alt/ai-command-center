'use client'
import { useEffect, useState } from 'react'
import {
  AudioLines, Loader2, Copy, Check, TriangleAlert, Link as LinkIcon,
  Download, FileText, Sparkles, Languages, History, Trash2, ChevronRight, Youtube, FileAudio,
} from 'lucide-react'

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

type HistoryItem = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
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

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyConfigured, setHistoryConfigured] = useState(true)

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
  }, [])

  function resetSecondary() {
    setSummary(null)
    setTranslation(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
      } else {
        setResult(data)
        loadHistory()
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
    } finally {
      setLoading(false)
    }
  }

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
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
    } finally {
      setTranslationLoading(false)
    }
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
        </div>
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
                  onClick={() => {
                    navigator.clipboard.writeText(translation.text)
                  }}
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
