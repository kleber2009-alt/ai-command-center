'use client'
import { apiFetch } from '@/lib/telegram'
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useTranscript } from '@/components/useTranscript'
import SummaryView from '@/components/SummaryView'
import GenerateButton from '@/components/GenerateButton'
import { patchLocal, isLocalId } from '@/lib/transcript-cache'
import type { Summary } from '@/lib/types'

export default function SummaryPage({ params }: { params: { id: string } }) {
  const { data, loading, error, setData } = useTranscript(params.id)
  const [busy, setBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const summary: Summary | null =
    data?.summary && data?.bullets ? { summary: data.summary, bullets: data.bullets } : null

  async function generate() {
    if (!data) return
    setGenError(null)
    setBusy(true)
    try {
      const res = await apiFetch('/api/transcribe/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isLocalId(data.id) ? undefined : data.id,
          transcript: data.transcript,
        }),
      })
      const r = await res.json()
      if (!res.ok) {
        setGenError(r.error || 'Не удалось сгенерировать саммари')
        return
      }
      const patch = { summary: r.summary, bullets: r.bullets }
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

  return (
    <div className="space-y-4">
      <GenerateButton
        loading={busy}
        onClick={generate}
        Icon={Sparkles}
        className="bg-violet-600/15 border-violet-500/30 text-violet-300 hover:bg-violet-600/25"
      >
        {summary ? 'Перегенерировать саммари' : 'Сгенерировать саммари'}
      </GenerateButton>
      {genError && <div className="text-xs text-rose-400">{genError}</div>}
      {summary && <SummaryView summary={summary} />}
    </div>
  )
}
