'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, FileAudio, History, Trash2, Youtube } from 'lucide-react'
import { formatTime, timeAgo } from '@/lib/format'
import { ARTIFACT_LABELS, type HistoryItem } from '@/lib/types'

export default function HistoryList({ limit = 30 }: { limit?: number }) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [configured, setConfigured] = useState(true)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/transcribe/history')
      const data = await res.json()
      setItems((data.items ?? []).slice(0, limit))
      setConfigured(data.configured !== false)
    } catch {}
    finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function del(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Удалить этот транскрипт?')) return
    try {
      await fetch(`/api/transcribe/history/${id}`, { method: 'DELETE' })
      load()
    } catch {}
  }

  if (!loaded) {
    return <div className="text-[11px] text-slate-600 px-1">Загружаем историю…</div>
  }

  if (!configured) {
    return (
      <div className="text-[11px] text-slate-600 px-1">
        История транскриптов выключена — добавьте{' '}
        <code className="text-slate-500">NEXT_PUBLIC_SUPABASE_URL</code> и{' '}
        <code className="text-slate-500">SUPABASE_SERVICE_KEY</code>, а также выполните миграцию{' '}
        <code className="text-slate-500">supabase/migrations/001_transcripts.sql</code>.
      </div>
    )
  }

  if (items.length === 0) {
    return <div className="text-[11px] text-slate-600 px-1">Пока пусто — сделайте первую транскрибацию.</div>
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/40 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-400" />
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">История</h3>
        <span className="text-[10px] text-slate-600">({items.length})</span>
      </div>
      <div className="divide-y divide-slate-700/30 max-h-[70vh] overflow-y-auto">
        {items.map(item => (
          <Link
            key={item.id}
            href={`/t/${item.id}`}
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
              onClick={e => del(item.id, e)}
              className="flex-shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
              title="Удалить"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 mt-1.5" />
          </Link>
        ))}
      </div>
    </div>
  )
}
