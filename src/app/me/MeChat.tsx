'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Brain, BookmarkPlus, Check, Copy, Download, History, Loader2, Mic, MessageSquarePlus, Pencil, RefreshCw, Send, Sparkles, Square, Trash2, TriangleAlert, X } from 'lucide-react'
import MeTabs from './MeTabs'
import { readNdjson } from '@/lib/stream-client'
import { apiFetch } from '@/lib/api-client'
import ChatSessionsDrawer from '@/components/ChatSessionsDrawer'
import MarkdownMessage from '@/components/MarkdownMessage'
import { useVoiceInput } from '@/lib/voice-input'

type Msg = { role: 'user' | 'assistant'; content: string; citations?: Citation[]; followups?: string[] }
type Citation = {
  document_id: string
  document_title: string
  chunk_index: number
  content?: string
  similarity: number
}

const SESSION_KEY = 'me-chat:session-id'

export default function MeChat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)
  const [savingToBrain, setSavingToBrain] = useState(false)
  const [savedToBrain, setSavedToBrain] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set())
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [sessionDocIds, setSessionDocIds] = useState<number[] | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Honour ?ask=... once: pre-fill the input (don't auto-send).
  // Read via window.location to avoid a Suspense boundary requirement
  // that useSearchParams imposes on statically-rendered pages.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ask = new URL(window.location.href).searchParams.get('ask')
    if (ask) {
      setInput(ask)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const voice = useVoiceInput({
    onResult: (text) => setInput((cur) => (cur ? cur + (cur.endsWith(' ') ? '' : ' ') + text : text)),
    onError: (msg) => setError(msg),
  })

  // Resume the last session if we have one, else create a new one.
  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(SESSION_KEY)
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
  }, [])

  async function createNewSession() {
    setCreatingSession(true)
    try {
      const res = await apiFetch('/api/me/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'me' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      const id: string = data.session.id
      setSessionId(id)
      setSessionDocIds(null)
      setMessages([])
      setError(null)
      try { localStorage.setItem(SESSION_KEY, id) } catch {}
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать сессию')
    } finally {
      setCreatingSession(false)
    }
  }

  async function loadSession(id: string) {
    const res = await apiFetch(`/api/me/chats/${id}`)
    if (!res.ok) {
      try { localStorage.removeItem(SESSION_KEY) } catch {}
      throw new Error('Сессия не найдена')
    }
    const data = await res.json()
    setSessionId(data.session.id)
    setSessionDocIds(Array.isArray(data.session?.doc_ids) ? data.session.doc_ids : null)
    setMessages((data.messages ?? []).map((m: any) => ({ role: m.role, content: m.content })))
    setError(null)
    try { localStorage.setItem(SESSION_KEY, data.session.id) } catch {}
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

  async function send(
    userText: string,
    opts: { regenerate?: boolean; editAtIndex?: number } = {},
  ) {
    const text = userText.trim()
    if (!text || loading) return
    setError(null)
    const isRegen = !!opts.regenerate
    const isEdit = typeof opts.editAtIndex === 'number'
    // - regen: drop the trailing assistant only
    // - edit: drop everything from editAtIndex onward and substitute the new user text
    // - normal: append user message at the end
    const baseHistory: Msg[] = isRegen
      ? messages.filter((m, i) => !(i === messages.length - 1 && m.role === 'assistant'))
      : isEdit
      ? [...messages.slice(0, opts.editAtIndex!), { role: 'user', content: text }]
      : [...messages, { role: 'user', content: text }]
    setMessages([...baseHistory, { role: 'assistant', content: '' }])
    if (!isRegen) setInput('')
    setLoading(true)
    try {
      // For edits we keep all messages BEFORE the edited one server-side,
      // then let the route's appendTurn add the new user+assistant pair.
      const truncateToCount = isEdit ? opts.editAtIndex! : undefined
      const res = await apiFetch('/api/me/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: baseHistory.map((m) => ({ role: m.role, content: m.content })),
          sessionId,
          regenerate: isRegen || undefined,
          truncateToCount,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Ошибка ${res.status}`)
      }
      let citations: Citation[] = []
      let acc = ''
      let streamError: string | null = null
      await readNdjson(res, (e) => {
        if (e.type === 'meta' && Array.isArray((e as any).citations)) {
          citations = (e as any).citations
        } else if (e.type === 'delta') {
          acc += e.text
          setMessages((m) => {
            const copy = m.slice()
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: acc, citations }
            }
            return copy
          })
        } else if (e.type === 'error') {
          streamError = e.error
        }
      })
      if (streamError) throw new Error(streamError)
      if (!acc) throw new Error('Пустой ответ от модели')
      // Fire-and-forget: ask Haiku for 3 follow-up questions, attach to last message when ready.
      const conversation = [...baseHistory, { role: 'assistant', content: acc }]
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
    } finally {
      setLoading(false)
    }
  }

  async function copyMessage(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1200)
    } catch {}
  }

  function exportAsMarkdown() {
    if (messages.length === 0) return
    const usable = messages.filter((m) => m.content && m.content.trim().length > 0)
    if (usable.length === 0) return
    const firstUser = usable.find((m) => m.role === 'user')?.content?.trim() ?? 'Chat'
    const title = firstUser.slice(0, 60).replace(/\s+/g, ' ')
    const today = new Date().toISOString().slice(0, 10)
    const body =
      `# Чат · ${today}\n\n${title}\n\n---\n\n` +
      usable
        .map((m) => `### ${m.role === 'user' ? 'Вопрос' : 'Ответ'}\n\n${m.content.trim()}`)
        .join('\n\n')
    const filename = `chat-${today}-${title.replace(/[^a-zA-Zа-яА-Я0-9]+/g, '-').slice(0, 40)}.md`
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

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
      const seed = firstUser.slice(0, 60).replace(/\s+/g, ' ')
      const title = `Чат: ${seed}${firstUser.length > 60 ? '…' : ''}`
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
            <>
            <button
              type="button"
              onClick={exportAsMarkdown}
              disabled={loading}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-apple-faint transition-colors hover:bg-apple-bg-soft hover:text-apple-ink disabled:opacity-50"
              aria-label="Скачать чат как Markdown"
              title="Скачать чат как Markdown"
            >
              <Download className="h-[18px] w-[18px]" />
            </button>
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
            </>
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
        <div className="mt-3">
          <MeTabs active="chat" />
        </div>
      </header>

      <ChatSessionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        kind="me"
        assistantId={null}
        currentSessionId={sessionId}
        onSelect={(id) => loadSession(id)}
        onNew={createNewSession}
      />

      <div className="flex-1 space-y-3 pb-4">
        {sessionDocIds && sessionDocIds.length > 0 && (
          <div className="flex items-start gap-2 rounded-apple-lg border border-apple-blue/30 bg-apple-blue/5 p-3 text-[13px] text-apple-ink">
            <Brain className="mt-0.5 h-4 w-4 shrink-0 text-apple-blue" />
            <div className="flex-1">
              <div className="font-medium">Контекст ограничен</div>
              <div className="mt-0.5 text-[12px] text-apple-muted">
                Отвечаю только по {sessionDocIds.length} {sessionDocIds.length === 1 ? 'выбранному документу' : 'выбранным документам'} из базы.
              </div>
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <>
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
            <div className="rounded-apple-lg border border-apple-line bg-white p-3 shadow-apple-sm">
              <p className="mb-2 px-1 text-[12px] font-medium text-apple-muted">С чего начать</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Подведи итог по моим проектам',
                  'Что я писал на этой неделе?',
                  'Какие у меня сильные темы по моей нише?',
                  'Сформулируй мой оффер одним предложением',
                ].map((s) => (
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
          </>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[92%]">
              {m.role === 'user' && editingIdx === i ? (
                <div className="rounded-[20px] rounded-br-md border border-apple-blue bg-white p-2 shadow-apple-sm">
                  <textarea
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        const v = editingValue.trim()
                        if (v) {
                          setEditingIdx(null)
                          send(v, { editAtIndex: i })
                        }
                      } else if (e.key === 'Escape') {
                        setEditingIdx(null)
                      }
                    }}
                    rows={3}
                    autoFocus
                    className="w-full resize-none rounded-lg bg-white p-2 text-[15px] leading-relaxed text-apple-ink outline-none"
                  />
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingIdx(null)}
                      className="grid h-8 w-8 place-items-center rounded-full text-apple-faint hover:bg-apple-bg-soft hover:text-apple-ink"
                      aria-label="Отменить"
                      title="Отменить"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const v = editingValue.trim()
                        if (!v) return
                        setEditingIdx(null)
                        send(v, { editAtIndex: i })
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-apple-blue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-apple-blue-hover"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Переотправить
                    </button>
                  </div>
                </div>
              ) : (
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
                {m.role === 'user' && m.content && !loading && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingValue(m.content)
                      setEditingIdx(i)
                    }}
                    className="absolute -bottom-2 -left-2 grid h-7 w-7 place-items-center rounded-full border border-apple-line bg-white text-apple-muted opacity-0 shadow-apple-sm transition group-hover:opacity-100"
                    aria-label="Редактировать"
                    title="Редактировать (Esc — отмена, ⌘/Ctrl+Enter — отправить)"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
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
              )}
              {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.citations.map((c, ci) => (
                      <Link
                        key={ci}
                        href={`/me/library/${c.document_id}`}
                        className="rounded-full bg-apple-bg-soft px-2 py-0.5 text-[11px] text-apple-muted transition-colors hover:bg-white hover:text-apple-ink hover:shadow-apple-sm"
                        title={`Открыть документ · sim ${(c.similarity * 100).toFixed(0)}%`}
                      >
                        [{c.document_title}]
                      </Link>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSources((prev) => {
                          const next = new Set(prev)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          return next
                        })
                      }
                      className="rounded-full px-2 py-0.5 text-[11px] text-apple-blue hover:bg-apple-bg-soft"
                    >
                      {expandedSources.has(i) ? 'Скрыть источники' : `Показать источники (${m.citations.length})`}
                    </button>
                  </div>
                  {expandedSources.has(i) && (
                    <ol className="space-y-2 rounded-xl border border-apple-line bg-apple-bg-elev p-3 text-[12.5px] leading-relaxed text-apple-muted">
                      {m.citations.map((c, ci) => (
                        <li key={ci} className="border-b border-apple-line last:border-0 last:pb-0 pb-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <Link
                              href={`/me/library/${c.document_id}`}
                              className="truncate text-[12px] font-medium text-apple-ink hover:underline"
                            >
                              {ci + 1}. {c.document_title}
                            </Link>
                            <span className="shrink-0 text-[11px] text-apple-faint">
                              sim {(c.similarity * 100).toFixed(0)}%
                            </span>
                          </div>
                          {c.content && (
                            <p className="whitespace-pre-wrap text-[12.5px] text-apple-muted">
                              {c.content.length > 600 ? c.content.slice(0, 600) + '…' : c.content}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
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
              {m.role === 'assistant' && m.content && !loading && i === messages.length - 1 && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      // Find the user message before this one to re-fire.
                      const prevUser = [...messages.slice(0, i)].reverse().find((x) => x.role === 'user')
                      if (prevUser) send(prevUser.content, { regenerate: true })
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-apple-muted hover:bg-apple-bg-soft hover:text-apple-ink"
                    title="Сгенерировать заново"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Заново
                  </button>
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
            placeholder={voice.state === 'recording' ? 'Слушаю…' : 'Спроси про себя, проекты, материалы…'}
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
