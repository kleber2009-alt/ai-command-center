'use client'
import { useState } from 'react'
import { Loader2, Video } from 'lucide-react'
import { useTranscript } from '@/components/useTranscript'
import ReelsView from '@/components/ReelsView'
import GenerateButton from '@/components/GenerateButton'
import { isLocalId, patchLocal } from '@/lib/transcript-cache'
import type { Generations, ReelsContent } from '@/lib/types'

export default function ReelsNewPage({ params }: { params: { id: string } }) {
  const { data, loading, error, setData } = useTranscript(params.id)
  const [busy, setBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const reels: ReelsContent | undefined = data?.generations?.['reels-new']

  async function generate() {
    if (!data) return
    setGenError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/transcribe/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isLocalId(data.id) ? undefined : data.id,
          transcript: data.transcript,
          type: 'reels-new',
        }),
      })
      const r = await res.json()
      if (!res.ok) {
        setGenError(r.error || 'Не удалось сгенерировать сценарий')
        return
      }
      const nextGen: Generations = { ...(data.generations ?? {}), 'reels-new': r.content }
      setData({ ...data, generations: nextGen })
      if (isLocalId(data.id)) patchLocal(data.id, { generations: nextGen })
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
        Icon={Video}
        className="bg-fuchsia-600/15 border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-600/25"
      >
        {reels ? 'Перегенерировать рилс' : 'Сгенерировать рилс'}
      </GenerateButton>
      {genError && <div className="text-xs text-rose-400">{genError}</div>}
      {reels && <ReelsView reels={reels} variant="new" />}
    </div>
  )
}
