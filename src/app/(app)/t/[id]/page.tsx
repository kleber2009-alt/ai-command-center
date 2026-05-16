'use client'
import { Loader2 } from 'lucide-react'
import { useTranscript } from '@/components/useTranscript'
import TranscriptView from '@/components/TranscriptView'

export default function TranscriptIndexPage({ params }: { params: { id: string } }) {
  const { data, loading, error } = useTranscript(params.id)

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка транскрипта…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-300">
        {error || 'Транскрипт не найден'}
      </div>
    )
  }
  return <TranscriptView data={data} />
}
