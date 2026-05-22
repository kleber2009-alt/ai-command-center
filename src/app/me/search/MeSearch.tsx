'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Search, TriangleAlert } from 'lucide-react'
import MeTabs from '../MeTabs'
import { apiFetch } from '@/lib/api-client'

type Match = {
  id: number
  document_id: number
  document_title: string
  chunk_index: number
  content: string
  similarity: number
}

function highlightSnippet(content: string, query: string): string {
  // Keep the snippet short and try to centre it on the first keyword hit.
  const max = 320
  if (content.length <= max) return content
  const q = query.trim().split(/\s+/).filter(Boolean)
  let hitIndex = -1
  for (const term of q) {
    if (!term) continue
    const idx = content.toLowerCase().indexOf(term.toLowerCase())
    if (idx >= 0) {
      hitIndex = idx
      break
    }
  }
  if (hitIndex < 0) return content.slice(0, max) + '…'
  const start = Math.max(0, hitIndex - 80)
  const end = Math.min(content.length, start + max)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return prefix + content.slice(start, end) + suffix
}

export default function MeSearch() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function runSearch(q: string) {
    if (!q.trim() || loading) return
    setLoading(true)
    setError(null)
    setSubmitted(q)
    try {
      const res = await apiFetch('/api/me/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim(), topK: 20 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setMatches(data.matches ?? [])
    } catch (e: any) {
      setError(e?.message || 'Не удалось выполнить поиск')
      setMatches([])
    } finally {
      setLoading(false)
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
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-apple-ink sm:text-[34px]">
            Поиск
          </h1>
          <p className="mt-1 text-[15px] text-apple-muted sm:text-base">
            Семантический поиск по всем фрагментам твоей базы. Запрос превращается в эмбеддинг и сравнивается с каждым куском.
          </p>
        </div>
        <MeTabs active="search" />
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          runSearch(query)
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-apple-faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Что найти в моих материалах?"
            className="w-full rounded-full border border-apple-line bg-apple-bg-soft py-2.5 pl-10 pr-3 text-[15px] text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-apple-bg-elev focus:shadow-apple-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-apple-blue px-5 py-2.5 text-[14px] font-medium text-apple-bg transition-colors hover:bg-apple-blue-hover active:bg-apple-blue-pressed disabled:cursor-not-allowed disabled:bg-apple-line-strong"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Найти
        </button>
      </form>

      {error && (
        <div className="flex items-start gap-2 rounded-apple-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && submitted && matches.length === 0 && !error && (
        <div className="rounded-apple-lg border border-dashed border-apple-line p-6 text-center text-[13px] text-apple-faint">
          Ничего не нашлось. Попробуй переформулировать или закинь больше материалов в Базу.
        </div>
      )}

      {matches.length > 0 && (
        <section className="space-y-3">
          <p className="text-[12px] text-apple-faint">
            Найдено {matches.length} {matches.length === 1 ? 'фрагмент' : 'фрагментов'}, отсортированы по релевантности.
          </p>
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/me/library/${m.document_id}`}
                  className="block rounded-apple-lg border border-apple-line bg-apple-bg-elev p-4 shadow-apple-sm transition-colors hover:bg-apple-bg-soft sm:p-5"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="truncate text-[14px] font-semibold text-apple-ink">
                      {m.document_title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-apple-bg-soft px-2 py-0.5 text-[11px] text-apple-muted">
                      {Math.round(m.similarity * 100)}%
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-apple-muted">
                    {highlightSnippet(m.content, submitted)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
