'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, FileAudio, FileText, FileType, Loader2, Save, Trash2, TriangleAlert,
} from 'lucide-react'
import MeTabs from '../../MeTabs'
import { apiFetch } from '@/lib/api-client'

type Doc = {
  id: number
  created_at: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  char_count: number
  chunk_count: number
  original_text: string
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

export default function MeDocumentDetail({ id }: { id: string }) {
  const router = useRouter()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<null | 'title' | 'reembed'>(null)
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch(`/api/me/documents/${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data }) => {
        if (cancelled) return
        if (!ok) throw new Error(data?.error || `Ошибка ${status}`)
        const d: Doc = data.document
        setDoc(d)
        setTitle(d.title)
        setText(d.original_text)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Не удалось загрузить документ')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const titleChanged = doc !== null && title.trim() !== doc.title
  const textChanged = doc !== null && text !== doc.original_text
  const dirty = titleChanged || textChanged

  async function save() {
    if (!doc || saving || !dirty) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, string> = {}
      if (titleChanged) body.title = title.trim()
      if (textChanged) body.text = text
      const res = await apiFetch(`/api/me/documents/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      const updated: Doc = { ...data.document, original_text: textChanged ? text : doc.original_text }
      setDoc(updated)
      setTitle(updated.title)
      setText(updated.original_text)
      setSaved(data.reembedded ? 'reembed' : 'title')
      if (savedTimeout.current) clearTimeout(savedTimeout.current)
      savedTimeout.current = setTimeout(() => setSaved(null), 2000)
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!doc || saving) return
    if (!confirm('Удалить документ из базы? Это удалит и все его фрагменты.')) return
    try {
      const res = await apiFetch(`/api/me/documents/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      router.push('/me/library')
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить')
    }
  }

  const Icon =
    doc?.source_type === 'paste' ? FileText : doc?.source_type === 'transcript' ? FileAudio : FileType

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/me/library"
          className="inline-flex items-center gap-1.5 text-[13px] text-apple-muted hover:text-apple-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Назад к базе
        </Link>
        <MeTabs active="library" />
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-apple-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
        </div>
      ) : error && !doc ? (
        <div className="flex items-start gap-2 rounded-apple-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : doc ? (
        <>
          <section className="rounded-apple-lg border border-apple-line bg-white p-5 shadow-apple-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-apple-bg-soft text-apple-muted">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-transparent bg-transparent text-[20px] font-semibold leading-tight text-apple-ink outline-none transition-colors hover:bg-apple-bg-soft focus:border-apple-line focus:bg-white"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-apple-faint">
                  <span>{timeAgo(doc.created_at)}</span>
                  <span>·</span>
                  <span>{text.length.toLocaleString('ru-RU')} симв.</span>
                  <span>·</span>
                  <span>{doc.chunk_count} {doc.chunk_count === 1 ? 'фрагмент' : 'фрагментов'}</span>
                  {doc.source_meta?.filename && (
                    <>
                      <span>·</span>
                      <span className="truncate">{doc.source_meta.filename}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={remove}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-red-50 hover:text-red-500"
                aria-label="Удалить"
                title="Удалить документ"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </section>

          <section className="rounded-apple-lg border border-apple-line bg-white p-5 shadow-apple-sm">
            <label className="mb-2 block text-[13px] font-semibold text-apple-ink">Оригинальный текст</label>
            <p className="mb-2.5 text-[12px] text-apple-faint">
              Если изменишь текст — после сохранения документ будет переразбит на фрагменты и заново заэмбеддится в OpenAI. Это может занять несколько секунд.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={24}
              spellCheck={false}
              className="w-full rounded-xl border border-apple-line bg-apple-bg-soft p-3 text-[14px] leading-relaxed text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white focus:shadow-apple-sm"
            />
          </section>

          {error && (
            <div className="flex items-start gap-2 rounded-apple-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 border-t border-apple-line bg-white/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6">
            <div className="flex items-center justify-end gap-2">
              {saved === 'title' && (
                <span className="text-[12px] text-apple-muted">Название обновлено</span>
              )}
              {saved === 'reembed' && (
                <span className="text-[12px] text-apple-muted">Переэмбеддено</span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 rounded-full bg-apple-blue px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-apple-blue-hover active:bg-apple-blue-pressed disabled:cursor-not-allowed disabled:bg-apple-line-strong"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {textChanged ? 'Эмбеддим…' : 'Сохраняем…'}
                  </>
                ) : saved ? (
                  <>
                    <Check className="h-4 w-4" /> Готово
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Сохранить
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
