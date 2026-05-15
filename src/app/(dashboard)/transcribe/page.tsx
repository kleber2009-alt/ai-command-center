'use client'
import { useState } from 'react'
import { AudioLines, Loader2, Copy, Check, TriangleAlert, Link as LinkIcon } from 'lucide-react'

type Paragraph = { text: string; start: number; end: number }
type Result = {
  transcript: string
  paragraphs: Paragraph[]
  duration: number | null
  detectedLanguage: string | null
}

function formatTime(sec: number) {
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

export default function TranscribePage() {
  const [url, setUrl] = useState('')
  const [language, setLanguage] = useState<'auto' | 'ru' | 'en'>('ru')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
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
      }
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
    } finally {
      setLoading(false)
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

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Транскрибация</h1>
          <p className="text-sm text-slate-500 mt-0.5">Прямая ссылка на аудио или видео → текст</p>
        </div>
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
              placeholder="https://example.com/audio.mp3"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all font-mono"
            />
          </div>
          <p className="text-[11px] text-slate-600 mt-1.5">
            Поддерживаются: mp3, wav, m4a, ogg, flac, mp4, mov, webm. До ~2 часов.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2 block">
              Язык
            </label>
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
                Транскрибируем...
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
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Транскрипт</h3>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                {result.duration !== null && <span>{formatTime(result.duration)}</span>}
                {result.detectedLanguage && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400 uppercase">
                    {result.detectedLanguage}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={copyTranscript}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  Скопировано
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Копировать
                </>
              )}
            </button>
          </div>
          <div className="p-5 max-h-[60vh] overflow-y-auto">
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
              <p className="text-sm text-slate-500 italic">Пустой результат (тишина или речь не распознана)</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
