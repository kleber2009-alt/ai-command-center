'use client'
import { apiFetch } from '@/lib/telegram'
import { useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import { useTranscript } from '@/components/useTranscript'
import TranslationView from '@/components/TranslationView'
import GenerateButton from '@/components/GenerateButton'
import { isLocalId, patchLocal } from '@/lib/transcript-cache'
import type { Translation } from '@/lib/types'

export default function TranslatePage({ params }: { params: { id: string } }) {
  const { data, loading, error, setData } = useTranscript(params.id)
  const [busy, setBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const translation: Translation | null = data?.translation
    ? { text: data.translation.text, lang: data.translation.lang as 'ru' | 'en' }
    : null

  async function translate(targetLang: 'ru' | 'en') {
    if (!data) return
    setGenError(null)
    setBusy(true)
    try {
      const res = await apiFetch('/api/transcribe/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isLocalId(data.id) ? undefined : data.id,
          transcript: data.transcript,
          targetLang,
        }),
      })
      const r = await res.json()
      if (!res.ok) {
        setGenError(r.error || 'Не удалось перевести')
        return
      }
      const patch = { translation: { text: r.translation, lang: r.lang as 'ru' | 'en' } }
      setData({ ...data, ...patch })
      if (isLocalId(data.id)) patchLocal(data.id, patch)
    } catch (e: any) {
      setGenError(e?.message || 'Сетевая ошибка')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
      </div>
    )
  }
  if (error || !data) {
    return <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-300">{error || 'Транскрипт не найден'}</div>
  }

  const otherLang: 'ru' | 'en' = data.detectedLanguage === 'en' ? 'ru' : 'en'

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <GenerateButton
          loading={busy}
          onClick={() => translate(otherLang)}
          Icon={Languages}
          className="bg-emerald-600/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/25"
        >
          Перевести на {otherLang === 'ru' ? 'русский' : 'английский'}
        </GenerateButton>
        <GenerateButton
          loading={busy}
          onClick={() => translate(otherLang === 'ru' ? 'en' : 'ru')}
          Icon={Languages}
          className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          На {otherLang === 'ru' ? 'английский' : 'русский'}
        </GenerateButton>
      </div>
      {genError && <div className="text-xs text-rose-400">{genError}</div>}
      {translation && <TranslationView translation={translation} />}
    </div>
  )
}
