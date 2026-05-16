'use client'
import { useEffect, useRef, useState } from 'react'
import { Brain, Check, Copy, Loader2, Send, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import MeTabs from './MeTabs'

type Msg = { role: 'user' | 'assistant'; content: string; citations?: Citation[] }
type Citation = { document_id: string; document_title: string; chunk_index: number; similarity: number }

const STORAGE_KEY = 'me-chat:singleton'

export default function MeChat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[]
        if (Array.isArray(parsed)) setMessages(parsed)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [input])

  async function send(userText: string) {
    const text = userText.trim()
    if (!text || loading) return
    setError(null)
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/me/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setMessages([...next, { role: 'assistant', content: data.text, citations: data.citations }])
    } catch (e: any) {
      setError(e?.message || 'Ошибка отправки')
    } finally {
      setLoading(false)
    }
  }

  function clearChat() {
    if (loading) return
    if (!confirm('Очистить переписку?')) return
    setMessages([])
    setError(null)
  }

  async function copyMessage(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1200)
    } catch {}
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-col">
      <header className="sticky top-0 z-10 -mx-4 -mt-5 mb-4 border-b border-apple-line bg-white/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:-mt-8 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-apple-bg-soft text-apple-ink">
            <Brain className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold text-apple-ink sm:text-base">Второй мозг</h1>
            <p className="truncate text-[12px] text-apple-faint sm:text-[13px]">Знает тебя, твои проекты и материалы</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              disabled={loading}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-apple-bg-soft hover:text-apple-ink disabled:opacity-50"
              aria-label="Очистить"
              title="Очистить переписку"
            >
              <Trash2 className="h-[16px] w-[16px]" />
            </button>
          )}
        </div>
        <div className="mt-3">
          <MeTabs active="chat" />
        </div>
      </header>

      <div className="flex-1 space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-5 shadow-apple-sm">
            <div className="flex items-center gap-2 text-apple-ink">
              <Sparkles className="h-4 w-4 text-apple-blue" />
              <span className="text-[13px] font-semibold">Привет</span>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-apple-ink">
              Я твой второй мозг. Сначала заполни <a href="/me/profile" className="text-apple-blue hover:underline">Профиль</a> и закинь материалы в <a href="/me/library" className="text-apple-blue hover:underline">Базу</a> — тогда я смогу отвечать о тебе и твоих проектах с опорой на конкретные источники.
            </p>
            <p className="mt-3 text-[13px] text-apple-muted">
              Спрашивай что угодно: о твоих проектах, прошлых решениях, контенте академии, идеях из заметок.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[92%]">
              <div
                className={
                  m.role === 'user'
                    ? 'group relative rounded-[20px] rounded-br-md bg-apple-blue px-3.5 py-2.5 text-[15px] leading-snug text-white shadow-apple-sm'
                    : 'group relative rounded-[20px] rounded-bl-md border border-apple-line bg-white px-3.5 py-2.5 text-[15px] leading-snug text-apple-ink shadow-apple-sm'
                }
              >
                <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed">{m.content}</pre>
                <button
                  type="button"
                  onClick={() => copyMessage(m.content, i)}
                  className="absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full border border-apple-line bg-white text-apple-muted opacity-0 shadow-apple-sm transition group-hover:opacity-100"
                  aria-label="Скопировать"
                >
                  {copiedIdx === i ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.citations.map((c, ci) => (
                    <span
                      key={ci}
                      className="rounded-full bg-apple-bg-soft px-2 py-0.5 text-[11px] text-apple-muted"
                      title={`sim ${(c.similarity * 100).toFixed(0)}%`}
                    >
                      [{c.document_title}]
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-[20px] rounded-bl-md border border-apple-line bg-white px-3.5 py-2.5 text-[13px] text-apple-muted shadow-apple-sm">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-apple-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700 sm:text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-apple-line bg-white/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Спроси про себя, проекты, материалы…"
            rows={1}
            disabled={loading}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none rounded-[20px] border border-apple-line bg-apple-bg-soft px-3.5 py-2 text-[15px] text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white focus:shadow-apple-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-apple-blue text-white transition-colors hover:bg-apple-blue-hover active:bg-apple-blue-pressed disabled:cursor-not-allowed disabled:bg-apple-line-strong"
            aria-label="Отправить"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}
