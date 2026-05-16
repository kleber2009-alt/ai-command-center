'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BookOpen, Copy, Filter, Flame, LayoutGrid, Loader2, Magnet,
  MessagesSquare, Package, Send, Sparkles, Target, TriangleAlert, Trash2, Check,
} from 'lucide-react'
import { getTelegram, isInTelegram } from '@/lib/telegram'

const ICONS: Record<string, any> = {
  Target, MessagesSquare, Send, Flame, Package, Filter, BookOpen, Magnet, LayoutGrid, Sparkles,
}

type Msg = { role: 'user' | 'assistant'; content: string }

type Props = {
  id: string
  name: string
  description: string
  icon: string
  buttonText: string
  helpText: string
}

function storageKey(id: string) {
  return `assistant-chat:${id}`
}

export default function AssistantChat({ id, name, description, icon, buttonText, helpText }: Props) {
  const Icon = ICONS[icon] ?? Sparkles
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Load chat from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(id))
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[]
        if (Array.isArray(parsed)) setMessages(parsed)
      }
    } catch {}
  }, [id])

  // Persist messages
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(messages))
    } catch {}
  }, [id, messages])

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  // Auto-resize textarea
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
    if (isInTelegram()) getTelegram()?.HapticFeedback?.impactOccurred?.('light')

    try {
      const res = await fetch('/api/assistants/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId: id, messages: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      setMessages([...next, { role: 'assistant', content: data.text }])
      if (isInTelegram()) getTelegram()?.HapticFeedback?.notificationOccurred?.('success')
    } catch (e: any) {
      setError(e?.message || 'Ошибка отправки')
      if (isInTelegram()) getTelegram()?.HapticFeedback?.notificationOccurred?.('error')
    } finally {
      setLoading(false)
    }
  }

  function showHelp() {
    if (!helpText || loading) return
    setMessages((m) => [...m, { role: 'assistant', content: helpText }])
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
      <header className="sticky top-0 z-10 -mx-3 -mt-4 mb-3 border-b border-slate-800 bg-slate-950/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:-mt-6 sm:px-5">
        <div className="flex items-center gap-3">
          <Link
            href="/assistants"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
            aria-label="Назад"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-200">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium text-slate-100 sm:text-base">{name}</h1>
            <p className="truncate text-xs text-slate-500">{description}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              disabled={loading}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200 disabled:opacity-50"
              aria-label="Очистить"
              title="Очистить переписку"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm text-slate-300">{description}</p>
            {helpText && (
              <button
                type="button"
                onClick={showHelp}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 sm:text-sm"
              >
                <Sparkles className="h-4 w-4" />
                {buttonText}
              </button>
            )}
            <p className="text-xs text-slate-500">
              Напиши сообщение ниже — ассистент сам уточнит детали, если нужно.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'flex justify-end'
                : 'flex justify-start'
            }
          >
            <div
              className={
                m.role === 'user'
                  ? 'group relative max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-sm text-white'
                  : 'group relative max-w-[92%] rounded-2xl rounded-bl-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100'
              }
            >
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed sm:text-sm">
                {m.content}
              </pre>
              <button
                type="button"
                onClick={() => copyMessage(m.content, i)}
                className="absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full border border-slate-700 bg-slate-950 text-slate-300 opacity-0 transition group-hover:opacity-100"
                aria-label="Скопировать"
              >
                {copiedIdx === i ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Печатает…
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-900/50 bg-rose-950/40 p-3 text-xs text-rose-300 sm:text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 -mx-3 mt-auto border-t border-slate-800 bg-slate-950/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
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
            placeholder="Опиши задачу…"
            rows={1}
            disabled={loading}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none ring-indigo-500/40 focus:border-slate-700 focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Отправить"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}
