'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Loader2, Plus, Trash2, TriangleAlert, Upload, FileType, FileBadge, FileAudio,
} from 'lucide-react'
import MeTabs from '../MeTabs'

type Doc = {
  id: string
  created_at: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  char_count: number
  chunk_count: number
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

export default function MeLibrary() {
  const [items, setItems] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<'paste' | 'file'>('paste')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [adding, setAdding] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/me/documents')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setItems(data.items ?? [])
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
      const res = await fetch('/api/me/documents', {
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
      const res = await fetch('/api/me/documents', { method: 'POST', body: fd })
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

  async function remove(id: string) {
    if (!confirm('Удалить документ из базы? Это удалит и все его чанки.')) return
    setError(null)
    try {
      const res = await fetch(`/api/me/documents/${id}`, { method: 'DELETE' })
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
            Supabase не настроен. Нужны <code className="rounded bg-white/60 px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
            <code className="rounded bg-white/60 px-1">SUPABASE_SERVICE_KEY</code>, <code className="rounded bg-white/60 px-1">OPENAI_API_KEY</code>{' '}
            и миграция <code className="rounded bg-white/60 px-1">003_me.sql</code>.
          </div>
        </div>
      )}

      {/* Add panel */}
      <div className="rounded-apple-lg border border-apple-line bg-white p-5 shadow-apple-sm">
        <div className="mb-4 inline-flex rounded-full bg-apple-bg-soft p-0.5">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              mode === 'paste' ? 'bg-white text-apple-ink shadow-apple-sm' : 'text-apple-muted hover:text-apple-ink'
            }`}
          >
            Вставить текст
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              mode === 'file' ? 'bg-white text-apple-ink shadow-apple-sm' : 'text-apple-muted hover:text-apple-ink'
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
            className="w-full rounded-xl border border-apple-line bg-apple-bg-soft px-3.5 py-2 text-[14px] text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white focus:shadow-apple-sm"
          />

          {mode === 'paste' ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сюда вставь текст: пост, конспект, главу из академии…"
                rows={8}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft p-3 text-[14px] leading-relaxed text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white focus:shadow-apple-sm"
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
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-apple-line bg-apple-bg-soft p-6 transition-colors hover:bg-white">
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
        <h2 className="mb-3 text-[13px] font-semibold text-apple-muted">
          В базе: {items.length} {items.length === 1 ? 'документ' : items.length < 5 && items.length > 0 ? 'документа' : 'документов'}
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-apple-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-apple-lg border border-dashed border-apple-line p-6 text-center text-[13px] text-apple-faint">
            База пустая. Добавь первый материал — и я смогу опираться на него в ответах.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-apple-lg border border-apple-line bg-white shadow-apple-sm">
            {items.map((d, i) => {
              const Icon =
                d.source_type === 'paste' ? FileText : d.source_type === 'transcript' ? FileAudio : FileType
              return (
                <li key={d.id} className={i > 0 ? 'border-t border-apple-line' : ''}>
                  <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-apple-bg-soft text-apple-muted">
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
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-red-50 hover:text-red-500"
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
        )}
      </section>
    </div>
  )
}
