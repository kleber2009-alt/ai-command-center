'use client'
import { useEffect, useState } from 'react'
import { Check, Loader2, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

type Session = {
  id: string
  kind: 'me' | 'assistant'
  assistant_id: string | null
  title: string
  created_at: string
  updated_at: string
  message_count: number
  last_message: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  kind: 'me' | 'assistant'
  assistantId: string | null
  currentSessionId: string | null
  onSelect: (sessionId: string) => void
  onNew: () => void
}

function timeAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000
  if (sec < 60) return 'только что'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч`
  const d = Math.floor(h / 24)
  return `${d} д`
}

export default function ChatSessionsDrawer({
  open, onClose, kind, assistantId, currentSessionId, onSelect, onNew,
}: Props) {
  const [items, setItems] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  async function commitRename(id: string) {
    const title = renameValue.trim()
    if (!title) {
      setRenamingId(null)
      return
    }
    try {
      const res = await apiFetch(`/api/me/chats/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      setItems((it) => it.map((s) => (s.id === id ? { ...s, title } : s)))
    } catch (e: any) {
      setError(e?.message || 'Не удалось переименовать')
    } finally {
      setRenamingId(null)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ kind })
    if (assistantId) params.set('assistantId', assistantId)
    apiFetch(`/api/me/chats?${params.toString()}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data }) => {
        if (cancelled) return
        if (!ok) throw new Error(data?.error || `Ошибка ${status}`)
        setItems(data.items ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Не удалось загрузить историю')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, kind, assistantId])

  async function remove(id: string) {
    if (!confirm('Удалить этот чат?')) return
    try {
      const res = await apiFetch(`/api/me/chats/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      setItems((it) => it.filter((s) => s.id !== id))
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Закрыть"
      />
      <aside className="flex h-full w-[min(360px,90vw)] flex-col border-l border-apple-line bg-white shadow-apple-lg">
        <header className="flex items-center justify-between border-b border-apple-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-apple-ink">История чатов</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-apple-muted hover:bg-apple-bg-soft hover:text-apple-ink"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-apple-line p-3">
          <button
            type="button"
            onClick={() => {
              onNew()
              onClose()
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-apple-blue px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-apple-blue-hover"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Новый чат
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-apple-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
            </div>
          ) : error ? (
            <div className="p-4 text-[13px] text-red-700">{error}</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-apple-faint">
              История пустая. Напиши первое сообщение — оно появится здесь.
            </div>
          ) : (
            <ul>
              {items.map((s, i) => {
                const active = s.id === currentSessionId
                return (
                  <li key={s.id} className={i > 0 ? 'border-t border-apple-line' : ''}>
                    <div className={`group flex items-stretch ${active ? 'bg-apple-bg-soft' : ''}`}>
                      {renamingId === s.id ? (
                        <div className="flex flex-1 items-center gap-2 px-4 py-3">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                commitRename(s.id)
                              } else if (e.key === 'Escape') {
                                setRenamingId(null)
                              }
                            }}
                            autoFocus
                            className="flex-1 rounded-lg border border-apple-line bg-white px-2 py-1 text-[13px] text-apple-ink outline-none focus:border-apple-line-strong focus:shadow-apple-sm"
                          />
                          <button
                            type="button"
                            onClick={() => commitRename(s.id)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-apple-blue text-white hover:bg-apple-blue-hover"
                            aria-label="Сохранить"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-apple-faint hover:bg-apple-bg-soft hover:text-apple-ink"
                            aria-label="Отменить"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelect(s.id)
                              onClose()
                            }}
                            className="flex flex-1 flex-col gap-1 px-4 py-3 text-left hover:bg-apple-bg-soft"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-[13px] font-medium text-apple-ink">
                                {s.title || 'Без названия'}
                              </div>
                              <span className="shrink-0 text-[11px] text-apple-faint">{timeAgo(s.updated_at)}</span>
                            </div>
                            {s.last_message && (
                              <div className="line-clamp-2 text-[12px] text-apple-muted">{s.last_message}</div>
                            )}
                            <div className="text-[11px] text-apple-faint">
                              {s.message_count} {s.message_count === 1 ? 'сообщение' : 'сообщений'}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenameValue(s.title || '')
                              setRenamingId(s.id)
                            }}
                            className="my-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-apple-faint opacity-0 transition-colors hover:bg-apple-bg-soft hover:text-apple-ink group-hover:opacity-100"
                            aria-label="Переименовать"
                            title="Переименовать"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(s.id)}
                            className="my-auto mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-red-50 hover:text-red-500"
                            aria-label="Удалить"
                            title="Удалить"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
