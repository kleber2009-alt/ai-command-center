'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AudioLines, Loader2, Link as LinkIcon, TriangleAlert } from 'lucide-react'
import { getTelegram, isInTelegram } from '@/lib/telegram'
import { newLocalId, saveLocal } from '@/lib/transcript-cache'
import type { TranscriptData } from '@/lib/types'
import HistoryList from '@/components/HistoryList'

export default function TranscribePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [language, setLanguage] = useState<'auto' | 'ru' | 'en'>('ru')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inTg, setInTg] = useState(false)
  const submitRef = useRef<() => void>(() => {})

  useEffect(() => {
    setInTg(isInTelegram())
  }, [])

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

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!url.trim() || loading) return
    const tg = getTelegram()
    tg?.HapticFeedback.impactOccurred('light')
    setError(null)
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
        return
      }
      tg?.HapticFeedback.notificationOccurred('success')
      const id: string = data.id ?? newLocalId()
      const td: TranscriptData = {
        id,
        url: url.trim(),
        transcript: data.transcript,
        paragraphs: data.paragraphs ?? [],
        duration: data.duration ?? null,
        detectedLanguage: data.detectedLanguage ?? null,
        source: data.source,
      }
      saveLocal(td)
      router.push(`/t/${id}`)
    } catch (err: any) {
      setError(err?.message || 'Сетевая ошибка')
      tg?.HapticFeedback.notificationOccurred('error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    submitRef.current = () => submit()
  })

  return (
    <div className="animate-slide-in space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Транскрибация</h1>
        <p className="text-sm text-slate-500 mt-0.5">YouTube или прямая ссылка → текст, саммари, перевод</p>
      </div>

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
              {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Обрабатываем...</>) : (<><AudioLines className="w-4 h-4" /> Получить текст</>)}
            </button>
          )}
        </div>
        {inTg && (
          <p className="text-[11px] text-slate-600 text-center">
            Нажми «Получить текст» внизу экрана
          </p>
        )}
      </form>

      {error && (
        <div className="flex items-start gap-2.5 bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
          <TriangleAlert className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs text-rose-400 uppercase tracking-wider font-medium mb-1">Ошибка</div>
            <p className="text-sm text-slate-300 break-words">{error}</p>
          </div>
        </div>
      )}

      <HistoryList limit={10} />
    </div>
  )
}
