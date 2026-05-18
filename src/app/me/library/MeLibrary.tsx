'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Brain, CheckSquare, ChevronRight, FileAudio, FileText, FileType, Loader2, Pin, Plus, Square as SquareIcon, Trash2, TriangleAlert, Upload, X,
} from 'lucide-react'
import MeTabs from '../MeTabs'
import { apiFetch } from '@/lib/api-client'

type Doc = {
  id: string
  created_at: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  char_count: number
  chunk_count: number
  pinned: 0 | 1
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

function bytesToReadable(n: number) {
  if (n < 1024) return n + ' Б'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' КБ'
  return (n / 1024 / 1024).toFixed(1) + ' МБ'
}

type Stats = {
  documents: number
  chunks: number
  characters: number
  last_added_at: string | null
  by_source: { paste: number; file: number; transcript: number }
}

export default function MeLibrary() {
  const [items, setItems] = useState<Doc[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<'paste' | 'file'>('paste')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | 'paste' | 'file' | 'transcript'>('all')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [askingMulti, setAskingMulti] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  async function askMultiDoc() {
    if (askingMulti || selectedIds.size === 0) return
    setAskingMulti(true)
    setError(null)
    try {
      const docIds = Array.from(selectedIds).map((s) => Number(s)).filter((n) => Number.isInteger(n))
      const res = await apiFetch('/api/me/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'me', docIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      const sid: string = data.session.id
      // Persist as the current /me session and navigate.
      try { localStorage.setItem('me-chat:session-id', sid) } catch {}
      router.push('/me')
    } catch (e: any) {
      setError(e?.message || 'Не удалось открыть чат')
    } finally {
      setAskingMulti(false)
    }
  }

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/me/documents')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setItems(data.items ?? [])
      setStats(data.stats ?? null)
      setConfigured(Boolean(data.configured))
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить базу')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addPaste(e?: React.FormEvent) {
    e?.preventDefault()
    if (!text.trim() || adding) return
    setAdding(true)
    setError(null)
    try {
      const res = await apiFetch('/api/me/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setTitle('')
      setText('')
      refresh()
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить')
    } finally {
      setAdding(false)
    }
  }

  async function addFile() {
    if (!file || adding) return
    setAdding(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (title.trim()) fd.append('title', title.trim())
      const res = await apiFetch('/api/me/documents', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setTitle('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      refresh()
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить')
    } finally {
      setAdding(false)
    }
  }

  async function togglePin(id: string, current: 0 | 1) {
    const next = current ? 0 : 1
    // Optimistic update with re-sort: pinned rows surface to the top.
    setItems((it) => {
      const updated = it.map((d) => (d.id === id ? { ...d, pinned: next as 0 | 1 } : d))
      updated.sort((a, b) => {
        if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      return updated
    })
    try {
      const res = await apiFetch(`/api/me/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !current }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось закрепить')
      // Revert optimistic change.
      setItems((it) => it.map((d) => (d.id === id ? { ...d, pinned: current } : d)))
    }
  }

  async function remove(id: string) {
    if (!confirm('Удалить документ из базы? Это удалит и все его чанки.')) return
    setError(null)
    try {
      const res = await apiFetch(`/api/me/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      setItems((it) => it.filter((d) => d.id !== id))
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить')
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/me" className="inline-flex items-center gap-1.5 text-[13px] text-apple-muted hover:text-apple-ink">
          <ArrowLeft className="h-3.5 w-3.5" />
          Назад к чату
        </Link>
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-apple-ink sm:text-[34px]">База знаний</h1>
          <p className="mt-1 text-[15px] text-apple-muted sm:text-base">
            Загружай материалы — посты, уроки, конспекты, статьи. Они нарезаются на куски, эмбеддятся и подтягиваются по релевантности.
          </p>
        </div>
        <MeTabs active="library" />
      </header>

      {!configured && (
        <div className="flex items-start gap-2 rounded-apple-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            База недоступна. Проверь, что переменная <code className="rounded bg-apple-bg-elev/60 px-1">DB_PATH</code> указывает на доступный путь, а
            <code className="rounded bg-apple-bg-elev/60 px-1">OPENAI_API_KEY</code> задан в <code className="rounded bg-apple-bg-elev/60 px-1">.env</code>.
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && stats.documents > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-3 text-center shadow-apple-sm">
            <div className="text-[20px] font-semibold leading-tight text-apple-ink">{stats.documents}</div>
            <div className="text-[11px] text-apple-faint">документов</div>
          </div>
          <div className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-3 text-center shadow-apple-sm">
            <div className="text-[20px] font-semibold leading-tight text-apple-ink">{stats.chunks}</div>
            <div className="text-[11px] text-apple-faint">фрагментов</div>
          </div>
          <div className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-3 text-center shadow-apple-sm">
            <div className="text-[20px] font-semibold leading-tight text-apple-ink">
              {stats.characters > 1000 ? `${Math.round(stats.characters / 1000)}k` : stats.characters}
            </div>
            <div className="text-[11px] text-apple-faint">символов</div>
          </div>
        </div>
      )}

      {/* Add panel */}
      <div className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-5 shadow-apple-sm">
        <div className="mb-4 inline-flex rounded-full bg-apple-bg-soft p-0.5">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              mode === 'paste' ? 'bg-apple-bg-elev text-apple-ink shadow-apple-sm' : 'text-apple-muted hover:text-apple-ink'
            }`}
          >
            Вставить текст
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              mode === 'file' ? 'bg-apple-bg-elev text-apple-ink shadow-apple-sm' : 'text-apple-muted hover:text-apple-ink'
            }`}
          >
            Загрузить файл
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название (необязательно — возьмётся из текста или имени файла)"
            className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3.5 py-2 text-[14px] text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-apple-bg-elev focus:shadow-apple-sm"
          />

          {mode === 'paste' ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сюда вставь текст: пост, конспект, главу из академии…"
                rows={8}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft p-3 text-[14px] leading-relaxed text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-apple-bg-elev focus:shadow-apple-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-apple-faint">{text.length} симв.</p>
                <button
                  type="button"
                  onClick={addPaste}
                  disabled={adding || !text.trim() || !configured}
                  className="inline-flex items-center gap-2 rounded-full bg-apple-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:bg-apple-line-strong"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Добавить в базу
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-apple-line bg-apple-bg-soft p-6 transition-colors hover:bg-apple-bg-elev">
                <Upload className="h-5 w-5 text-apple-muted" />
                <span className="text-[14px] font-medium text-apple-ink">
                  {file ? file.name : 'Выбрать файл'}
                </span>
                <span className="text-[12px] text-apple-faint">
                  {file ? bytesToReadable(file.size) : '.txt · .md · .csv · .json · .pdf · .docx'}
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addFile}
                  disabled={adding || !file || !configured}
                  className="inline-flex items-center gap-2 rounded-full bg-apple-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:bg-apple-line-strong"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Загрузить и обработать
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-apple-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* List */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-apple-muted">
            В базе: {items.length} {items.length === 1 ? 'документ' : items.length < 5 && items.length > 0 ? 'документа' : 'документов'}
          </h2>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full bg-apple-bg-soft p-0.5">
                {([
                  ['all', 'Все'],
                  ['paste', 'Текст'],
                  ['file', 'Файлы'],
                  ['transcript', 'Транскрипты'],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all ${
                      filter === k ? 'bg-apple-bg-elev text-apple-ink shadow-apple-sm' : 'text-apple-muted hover:text-apple-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!selecting ? (
                <button
                  type="button"
                  onClick={() => setSelecting(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-apple-bg-elev px-3 py-1 text-[12px] font-medium text-apple-ink shadow-apple-sm hover:bg-apple-bg-soft"
                  title="Выбрать документы и задать вопрос только по ним"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Выбрать
                </button>
              ) : (
                <button
                  type="button"
                  onClick={exitSelectMode}
                  className="grid h-7 w-7 place-items-center rounded-full text-apple-faint hover:bg-apple-bg-soft hover:text-apple-ink"
                  title="Выйти из режима выбора"
                  aria-label="Выйти из режима выбора"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {selecting && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-apple-lg border border-apple-line bg-apple-bg-elev p-3 shadow-apple-sm">
            <span className="text-[12px] text-apple-muted">
              {selectedIds.size === 0
                ? 'Отметь документы, чтобы задать вопрос только по ним'
                : `Выбрано: ${selectedIds.size}`}
            </span>
            <button
              type="button"
              onClick={askMultiDoc}
              disabled={askingMulti || selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-apple-blue px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:bg-apple-line-strong"
            >
              {askingMulti ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Открываем…
                </>
              ) : (
                <>
                  <Brain className="h-3.5 w-3.5" />
                  Спросить про {selectedIds.size}
                </>
              )}
            </button>
          </div>
        )}
        {(() => {
          const visible = filter === 'all' ? items : items.filter((d) => d.source_type === filter)
          if (loading) {
            return (
              <div className="flex items-center gap-2 text-apple-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
              </div>
            )
          }
          if (items.length === 0) {
            return (
              <div className="rounded-apple-lg border border-dashed border-apple-line p-6 text-center text-[13px] text-apple-faint">
                База пустая. Добавь первый материал — и я смогу опираться на него в ответах.
              </div>
            )
          }
          if (visible.length === 0) {
            return (
              <div className="rounded-apple-lg border border-dashed border-apple-line p-6 text-center text-[13px] text-apple-faint">
                По этому фильтру пусто.
              </div>
            )
          }
          return (
          <ul className="overflow-hidden rounded-apple-lg border border-apple-line bg-apple-bg-elev shadow-apple-sm">
            {visible.map((d, i) => {
              const Icon =
                d.source_type === 'paste' ? FileText : d.source_type === 'transcript' ? FileAudio : FileType
              return (
                <li key={d.id} className={i > 0 ? 'border-t border-apple-line' : ''}>
                  <div className={`group flex items-stretch ${selecting && selectedIds.has(d.id) ? 'bg-apple-bg-soft' : ''}`}>
                    {selecting && (
                      <button
                        type="button"
                        onClick={() => toggleSelected(d.id)}
                        className="flex shrink-0 items-center pl-4 pr-1 text-apple-muted hover:text-apple-ink"
                        aria-label={selectedIds.has(d.id) ? 'Снять выбор' : 'Выбрать'}
                      >
                        {selectedIds.has(d.id) ? (
                          <CheckSquare className="h-4 w-4 text-apple-blue" />
                        ) : (
                          <SquareIcon className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <Link
                      href={`/me/library/${d.id}`}
                      onClick={(e) => {
                        if (selecting) {
                          e.preventDefault()
                          toggleSelected(d.id)
                        }
                      }}
                      className="flex flex-1 items-start gap-3 px-4 py-3.5 transition-colors hover:bg-apple-bg-soft sm:px-5"
                    >
                      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-apple-bg-soft text-apple-muted group-hover:bg-apple-bg-elev group-hover:shadow-apple-sm">
                        <Icon className="h-[16px] w-[16px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-apple-ink">{d.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-apple-faint">
                          <span>{timeAgo(d.created_at)}</span>
                          <span>·</span>
                          <span>{d.char_count.toLocaleString('ru-RU')} симв.</span>
                          <span>·</span>
                          <span>{d.chunk_count} {d.chunk_count === 1 ? 'фрагмент' : 'фрагментов'}</span>
                          {d.source_meta?.filename && (
                            <>
                              <span>·</span>
                              <span className="truncate">{d.source_meta.filename}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-apple-faint group-hover:text-apple-muted" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => togglePin(d.id, d.pinned)}
                      className={`my-auto grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
                        d.pinned
                          ? 'text-apple-blue hover:bg-apple-bg-soft'
                          : 'text-apple-faint opacity-0 hover:bg-apple-bg-soft hover:text-apple-ink group-hover:opacity-100'
                      }`}
                      aria-label={d.pinned ? 'Открепить' : 'Закрепить'}
                      title={d.pinned ? 'Открепить' : 'Закрепить'}
                    >
                      <Pin className={`h-3.5 w-3.5 ${d.pinned ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      className="my-auto mr-3 grid h-8 w-8 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          )
        })()}
      </section>
    </div>
  )
}
