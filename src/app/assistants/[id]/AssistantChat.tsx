'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BookmarkPlus, BookOpen, Copy, Filter, Flame, History, LayoutGrid, Loader2, Magnet, MessageSquarePlus,
  MessagesSquare, Mic, Package, Send, Sparkles, Square, Target, TriangleAlert, Trash2, Check,
} from 'lucide-react'
import { getTelegram, isInTelegram } from '@/lib/telegram'
import { readNdjson } from '@/lib/stream-client'
import { apiFetch } from '@/lib/api-client'
import ChatSessionsDrawer from '@/components/ChatSessionsDrawer'
import MarkdownMessage from '@/components/MarkdownMessage'
import { useVoiceInput } from '@/lib/voice-input'

const ICONS: Record<string, any> = {
  Target, MessagesSquare, Send, Flame, Package, Filter, BookOpen, Magnet, LayoutGrid, Sparkles,
}

type Msg = { role: 'user' | 'assistant'; content: string; followups?: string[] }

type Props = {
  id: string
  name: string
  description: string
  icon: string
  buttonText: string
  helpText: string
  starters?: string[]
}

function sessionKey(id: string) {
  return `assistant-chat:${id}:session`
}

export default function AssistantChat({ id, name, description, icon, buttonText, helpText, starters }: Props) {
  const Icon = ICONS[icon] ?? Sparkles
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const voice = useVoiceInput({
    onResult: (text) => setInput((cur) => (cur ? cur + (cur.endsWith(' ') ? '' : ' ') + text : text)),
    onError: (msg) => setError(msg),
  })

  const [savingToBrain, setSavingToBrain] = useState(false)
  const [savedToBrain, setSavedToBrain] = useState(false)

  async function saveChatToLibrary() {
    if (savingToBrain || messages.length === 0) return
    const usable = messages.filter((m) => m.content && m.content.trim().length > 0)
    if (usable.length === 0) return
    setSavingToBrain(true)
    setError(null)
    try {
      const body = usable
        .map((m) => `### ${m.role === 'user' ? 'Вопрос' : 'Ответ'}\n\n${m.content.trim()}`)
        .join('\n\n')
      const firstUser = usable.find((m) => m.role === 'user')?.content?.trim() ?? ''
      const seed = firstUser.slice(0, 50).replace(/\s+/g, ' ')
      const title = `${name} · ${seed}${firstUser.length > 50 ? '…' : ''}`
      const res = await apiFetch('/api/me/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, text: body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setSavedToBrain(true)
      setTimeout(() => setSavedToBrain(false), 1800)
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить чат')
    } finally {
      setSavingToBrain(false)
    }
  }

  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(sessionKey(id))
      } catch {
        return null
      }
    })()
    if (stored) {
      loadSession(stored).catch(() => createNewSession())
    } else {
      createNewSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function createNewSession() {
    setCreatingSession(true)
    try {
      const res = await apiFetch('/api/me/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'assistant', assistantId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      const sid: string = data.session.id
      setSessionId(sid)
      setMessages([])
      setError(null)
      try { localStorage.setItem(sessionKey(id), sid) } catch {}
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать сессию')
    } finally {
      setCreatingSession(false)
    }
  }

  async function loadSession(sid: string) {
    const res = await apiFetch(`/api/me/chats/${sid}`)
    if (!res.ok) {
      try { localStorage.removeItem(sessionKey(id)) } catch {}
      throw new Error('Сессия не найдена')
    }
    const data = await res.json()
    if (data.session?.assistant_id !== id) {
      try { localStorage.removeItem(sessionKey(id)) } catch {}
      throw new Error('Сессия другого ассистента')
    }
    setSessionId(data.session.id)
    setMessages((data.messages ?? []).map((m: any) => ({ role: m.role, content: m.content })))
    setError(null)
    try { localStorage.setItem(sessionKey(id), data.session.id) } catch {}
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

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
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    if (isInTelegram()) getTelegram()?.HapticFeedback?.impactOccurred?.('light')

    try {
      const res = await apiFetch('/api/assistants/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId: id, messages: next, sessionId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      let acc = ''
      let streamError: string | null = null
      await readNdjson(res, (e) => {
        if (e.type === 'delta') {
          acc += e.text
          setMessages((m) => {
            const copy = m.slice()
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: acc }
            }
            return copy
          })
        } else if (e.type === 'error') {
          streamError = e.error
        }
      })
      if (streamError) throw new Error(streamError)
      if (!acc) throw new Error('Пустой ответ от модели')
      if (isInTelegram()) getTelegram()?.HapticFeedback?.notificationOccurred?.('success')
      // Fire-and-forget: ask Haiku for 3 follow-ups, attach to last assistant message when ready.
      const conversation = [...next, { role: 'assistant' as const, content: acc }]
      apiFetch('/api/me/chat/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation }),
      })
        .then((r) => (r.ok ? r.json() : Promise.resolve({ questions: [] })))
        .then((data) => {
          const qs: string[] = Array.isArray(data?.questions) ? data.questions : []
          if (qs.length === 0) return
          setMessages((m) => {
            const copy = m.slice()
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, followups: qs }
            }
            return copy
          })
        })
        .catch(() => {})
    } catch (e: any) {
      setError(e?.message || 'Ошибка отправки')
      setMessages((m) => {
        const copy = m.slice()
        const last = copy[copy.length - 1]
        if (last && last.role === 'assistant' && !last.content) copy.pop()
        return copy
      })
      if (isInTelegram()) getTelegram()?.HapticFeedback?.notificationOccurred?.('error')
    } finally {
      setLoading(false)
    }
  }

  function showHelp() {
    if (!helpText || loading) return
    setMessages((m) => [...m, { role: 'assistant', content: helpText }])
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
          <Link
            href="/assistants"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-apple-muted transition-colors hover:bg-apple-bg-soft hover:text-apple-ink"
            aria-label="Назад"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-apple-bg-soft text-apple-ink">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold text-apple-ink sm:text-base">{name}</h1>
            <p className="truncate text-[12px] text-apple-faint sm:text-[13px]">{description}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={saveChatToLibrary}
              disabled={loading || savingToBrain}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-apple-bg-soft hover:text-apple-ink disabled:opacity-50"
              aria-label="Сохранить чат в Базу"
              title={savedToBrain ? 'Сохранено' : 'Сохранить чат в Базу'}
            >
              {savingToBrain ? (
                <Loader2 className="h-[16px] w-[16px] animate-spin" />
              ) : savedToBrain ? (
                <Check className="h-[18px] w-[18px] text-emerald-500" />
              ) : (
                <BookmarkPlus className="h-[18px] w-[18px]" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={createNewSession}
            disabled={loading || creatingSession}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-apple-bg-soft hover:text-apple-ink disabled:opacity-50"
            aria-label="Новый чат"
            title="Новый чат"
          >
            <MessageSquarePlus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            disabled={loading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-apple-bg-soft hover:text-apple-ink disabled:opacity-50"
            aria-label="История чатов"
            title="История чатов"
          >
            <History className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <ChatSessionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        kind="assistant"
        assistantId={id}
        currentSessionId={sessionId}
        onSelect={(sid) => loadSession(sid)}
        onNew={createNewSession}
      />

      <div className="flex-1 space-y-3 pb-4">
        {messages.length === 0 && (
          <>
            <div className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-5 shadow-apple-sm">
              <p className="text-[15px] leading-relaxed text-apple-ink">{description}</p>
              {helpText && (
                <button
                  type="button"
                  onClick={showHelp}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-apple-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-apple-blue-hover active:bg-apple-blue-pressed sm:text-sm"
                >
                  <Sparkles className="h-4 w-4" />
                  {buttonText}
                </button>
              )}
              <p className="mt-3 text-[13px] text-apple-muted">
                Напиши сообщение ниже — ассистент сам уточнит детали, если нужно.
              </p>
            </div>
            {starters && starters.length > 0 && (
              <div className="rounded-apple-lg border border-apple-line bg-white p-3 shadow-apple-sm">
                <p className="mb-2 px-1 text-[12px] font-medium text-apple-muted">С чего начать</p>
                <div className="flex flex-wrap gap-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setInput(s)
                        inputRef.current?.focus()
                      }}
                      className="rounded-full border border-apple-line bg-white px-3 py-1.5 text-[13px] text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div className={m.role === 'user' ? 'max-w-[88%]' : 'max-w-[92%]'}>
            <div
              className={
                m.role === 'user'
                  ? 'group relative rounded-[20px] rounded-br-md bg-apple-blue px-3.5 py-2.5 text-[15px] leading-snug text-white shadow-apple-sm'
                  : 'group relative rounded-[20px] rounded-bl-md border border-apple-line bg-white px-3.5 py-2.5 text-[15px] leading-snug text-apple-ink shadow-apple-sm'
              }
            >
              {m.role === 'assistant' && m.content === '' ? (
                <span className="flex items-center gap-1 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-apple-faint" style={{ animationDelay: '300ms' }} />
                </span>
              ) : m.role === 'assistant' ? (
                <MarkdownMessage content={m.content} className="text-[15px] leading-relaxed" />
              ) : (
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</p>
              )}
              {m.content && (
                <button
                  type="button"
                  onClick={() => copyMessage(m.content, i)}
                  className="absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full border border-apple-line bg-white text-apple-muted opacity-0 shadow-apple-sm transition group-hover:opacity-100"
                  aria-label="Скопировать"
                >
                  {copiedIdx === i ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            {m.role === 'assistant' && m.followups && m.followups.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.followups.map((q, qi) => (
                  <button
                    key={qi}
                    type="button"
                    onClick={() => {
                      setInput(q)
                      inputRef.current?.focus()
                    }}
                    className="rounded-full border border-apple-line bg-white px-3 py-1.5 text-[12.5px] text-apple-ink shadow-apple-sm transition-colors hover:bg-apple-bg-soft"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        ))}

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
            placeholder={voice.state === 'recording' ? 'Слушаю…' : 'Опиши задачу…'}
            rows={1}
            disabled={loading || voice.state !== 'idle'}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none rounded-[20px] border border-apple-line bg-apple-bg-soft px-3.5 py-2 text-[15px] text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white focus:shadow-apple-sm disabled:opacity-60"
          />
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              disabled={loading || voice.state === 'transcribing'}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:bg-apple-line-strong ${
                voice.state === 'recording'
                  ? 'bg-red-500 text-white animate-pulse hover:bg-red-600'
                  : 'border border-apple-line bg-white text-apple-ink hover:bg-apple-bg-soft'
              }`}
              aria-label={voice.state === 'recording' ? 'Остановить запись' : 'Голосовой ввод'}
              title={voice.state === 'recording' ? 'Остановить запись' : 'Голосовой ввод'}
            >
              {voice.state === 'transcribing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : voice.state === 'recording' ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim() || voice.state !== 'idle'}
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
