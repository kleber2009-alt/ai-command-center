'use client'
import { useEffect, useState } from 'react'
import { fetchTranscript } from '@/lib/transcript-cache'
import type { TranscriptData } from '@/lib/types'

export function useTranscript(id: string) {
  const [data, setData] = useState<TranscriptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTranscript(id)
      .then(d => {
        if (cancelled) return
        if (!d) setError('Транскрипт не найден. Возможно, он не сохранён в Supabase или сессия истекла.')
        else setData(d)
      })
      .catch(e => {
        if (!cancelled) setError(e?.message || 'Не удалось загрузить транскрипт')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return { data, loading, error, setData }
}
