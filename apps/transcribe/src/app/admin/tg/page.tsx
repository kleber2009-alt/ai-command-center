'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Bot, Flame, Loader2, MessageSquare, RefreshCw, Users,
} from 'lucide-react'
import {
  type ChatSummary, type MessageRow, type UserRow,
  STATUS_LABEL, STATUS_COLOR, type Action, type MessageClass,
} from '@/lib/tg-db'

type Tab = 'messages' | 'users'

const ACTION_COLOR: Record<Action, string> = {
  IGNORE: 'bg-slate-700/40 text-slate-400',
  REPLY: 'bg-sky-500/15 text-sky-300',
  REPLY_SOFT: 'bg-cyan-500/15 text-cyan-300',
  REPLY_AND_NOTIFY: 'bg-orange-500/20 text-orange-300',
  NOTIFY_ONLY: 'bg-amber-500/15 text-amber-300',
  DRAFT_FOR_OWNER: 'bg-violet-500/15 text-violet-300',
}

const CLASS_COLOR: Record<MessageClass, string> = {
  GENERAL_CHAT: 'text-slate-400',
  QUESTION: 'text-sky-300',
  PRODUCT_INTEREST: 'text-amber-300',
  PRICE_REQUEST: 'text-orange-300',
  OBJECTION: 'text-rose-300',
  BUYING_INTENT: 'text-emerald-300',
  NEGATIVE: 'text-rose-400',
  SUPPORT_REQUEST: 'text-indigo-300',
  OWNER_REQUEST: 'text-fuchsia-300',
  SPAM: 'text-slate-500',
}

export default function AdminTgPage() {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('messages')
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [togglingChat, setTogglingChat] = useState<number | null>(null)

  async function loadChats() {
    setLoadingChats(true)
    try {
      const res = await fetch('/api/tg/chats', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось загрузить чаты')
      } else {
        setChats(data.items ?? [])
        setConfigured(data.configured !== false)
        setError(null)
        if (!selectedChatId && data.items?.length) {
          setSelectedChatId(Number(data.items[0].chat_id))
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сетевая ошибка')
    } finally {
      setLoadingChats(false)
    }
  }

  async function loadDetail(chatId: number) {
    setLoadingDetail(true)
    try {
      const [msgRes, userRes] = await Promise.all([
        fetch(`/api/tg/chats/${chatId}/messages?limit=50`, { cache: 'no-store' }),
        fetch(`/api/tg/chats/${chatId}/users`, { cache: 'no-store' }),
      ])
      const msgData = await msgRes.json()
      const userData = await userRes.json()
      if (msgRes.ok) setMessages(msgData.items ?? [])
      if (userRes.ok) setUsers(userData.items ?? [])
    } finally {
      setLoadingDetail(false)
    }
  }

  async function toggleAutoReply(chat: ChatSummary) {
    setTogglingChat(chat.chat_id)
    try {
      const res = await fetch(`/api/tg/chats/${chat.chat_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_reply: !chat.auto_reply }),
      })
      if (res.ok) {
        const updated = await res.json()
        setChats((cs) =>
          cs.map((c) =>
            c.chat_id === chat.chat_id ? { ...c, auto_reply: updated.auto_reply } : c,
          ),
        )
      }
    } finally {
      setTogglingChat(null)
    }
  }

  useEffect(() => { loadChats() }, [])
  useEffect(() => {
    if (selectedChatId !== null) loadDetail(selectedChatId)
  }, [selectedChatId])

  const selectedChat = useMemo(
    () => chats.find((c) => c.chat_id === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  if (!configured) {
    return (
      <div className="text-slate-300">
        <Header />
        <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-amber-200">
          Supabase не настроен. Заполните <code>NEXT_PUBLIC_SUPABASE_URL</code> и
          <code className="ml-1">SUPABASE_SERVICE_KEY</code> и запустите миграцию
          <code className="ml-1">supabase/migrations/005_tg_agent.sql</code>.
        </div>
      </div>
    )
  }

  return (
    <div className="text-slate-200">
      <Header onRefresh={loadChats} />
      {error && (
        <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <ChatList
          chats={chats}
          loading={loadingChats}
          selectedId={selectedChatId}
          onSelect={setSelectedChatId}
          onToggle={toggleAutoReply}
          togglingChat={togglingChat}
        />

        <div className="min-h-[400px] rounded-lg border border-slate-800 bg-slate-900/40">
          {selectedChat ? (
            <ChatDetail
              chat={selectedChat}
              tab={tab}
              onTab={setTab}
              messages={messages}
              users={users}
              loading={loadingDetail}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-12 text-sm text-slate-500">
              {loadingChats ? 'Загрузка…' : 'Выберите чат слева'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Header({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="rounded-md p-2 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          aria-label="Назад"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Bot className="h-5 w-5 text-indigo-400" />
        <h1 className="text-lg font-semibold text-slate-100">Telegram-агент</h1>
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Обновить
        </button>
      )}
    </div>
  )
}

function ChatList({
  chats, loading, selectedId, onSelect, onToggle, togglingChat,
}: {
  chats: ChatSummary[]
  loading: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  onToggle: (chat: ChatSummary) => void
  togglingChat: number | null
}) {
  if (loading && chats.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }
  if (chats.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Чатов пока нет. Добавьте бота в группу — после первого сообщения чат появится здесь.
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {chats.map((chat) => {
        const isSelected = chat.chat_id === selectedId
        return (
          <li key={chat.chat_id}>
            <button
              type="button"
              onClick={() => onSelect(chat.chat_id)}
              className={`group w-full rounded-lg border px-4 py-3 text-left transition ${
                isSelected
                  ? 'border-indigo-500/40 bg-indigo-500/5'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-100">
                    {chat.title ?? `Чат ${chat.chat_id}`}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    id {chat.chat_id}
                  </div>
                </div>
                <AutoReplyToggle
                  on={chat.auto_reply}
                  loading={togglingChat === chat.chat_id}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggle(chat)
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> {chat.total_messages}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-400" />{' '}
                  <span className={chat.hot_leads > 0 ? 'text-orange-300' : ''}>
                    {chat.hot_leads}
                  </span>
                </span>
                {chat.last_message_at && (
                  <span className="ml-auto text-slate-500">
                    {formatRelative(chat.last_message_at)}
                  </span>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function AutoReplyToggle({
  on, loading, onChange,
}: {
  on: boolean
  loading: boolean
  onChange: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={loading}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        on ? 'bg-indigo-500' : 'bg-slate-700'
      } ${loading ? 'opacity-50' : ''}`}
      title={on ? 'Авто-ответы включены' : 'Авто-ответы выключены'}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function ChatDetail({
  chat, tab, onTab, messages, users, loading,
}: {
  chat: ChatSummary
  tab: Tab
  onTab: (t: Tab) => void
  messages: MessageRow[]
  users: UserRow[]
  loading: boolean
}) {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="text-base font-semibold text-slate-100">
            {chat.title ?? `Чат ${chat.chat_id}`}
          </div>
          <div className="text-xs text-slate-500">
            id {chat.chat_id} · авто-ответы {chat.auto_reply ? 'ВКЛ' : 'ВЫКЛ'}
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-sm">
          <TabBtn active={tab === 'messages'} onClick={() => onTab('messages')}>
            <MessageSquare className="h-3.5 w-3.5" /> Сообщения ({messages.length})
          </TabBtn>
          <TabBtn active={tab === 'users'} onClick={() => onTab('users')}>
            <Users className="h-3.5 w-3.5" /> Пользователи ({users.length})
          </TabBtn>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : tab === 'messages' ? (
          <MessagesList items={messages} users={users} />
        ) : (
          <UsersList items={users} />
        )}
      </div>
    </div>
  )
}

function TabBtn({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
        active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function MessagesList({ items, users }: { items: MessageRow[]; users: UserRow[] }) {
  const userById = useMemo(() => {
    const m = new Map<number, UserRow>()
    for (const u of users) m.set(u.user_id, u)
    return m
  }, [users])

  if (items.length === 0) {
    return <div className="text-sm text-slate-500">Сообщений пока нет.</div>
  }
  return (
    <ul className="space-y-3">
      {items.map((m) => {
        const u = m.user_id != null ? userById.get(m.user_id) : undefined
        const author = u ? formatUser(u) : m.user_id != null ? `id ${m.user_id}` : 'unknown'
        return (
          <li
            key={m.id}
            className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-300">{author}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">{formatRelative(m.created_at)}</span>
              {m.class && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className={CLASS_COLOR[m.class] ?? 'text-slate-400'}>
                    {m.class}
                    {m.confidence != null && (
                      <span className="ml-1 text-slate-500">
                        {m.confidence.toFixed(2)}
                      </span>
                    )}
                  </span>
                </>
              )}
              {m.action && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    ACTION_COLOR[m.action] ?? 'bg-slate-700/40 text-slate-300'
                  }`}
                >
                  {m.action}
                </span>
              )}
            </div>
            <div className="mt-2 whitespace-pre-wrap text-slate-200">{m.text}</div>
            {m.response && (
              <div className="mt-3 rounded-md border-l-2 border-indigo-500/40 bg-indigo-500/5 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-indigo-300">
                  <Bot className="h-3 w-3" /> Ответ бота
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                  {m.response}
                </div>
              </div>
            )}
            {m.reasoning && (
              <div className="mt-2 text-xs italic text-slate-500">
                {m.reasoning}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function UsersList({ items }: { items: UserRow[] }) {
  if (items.length === 0) {
    return <div className="text-sm text-slate-500">Пользователей пока нет.</div>
  }
  return (
    <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
      {items.map((u) => (
        <li
          key={`${u.chat_id}-${u.user_id}`}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-slate-100">{formatUser(u)}</div>
            <div className="truncate text-xs text-slate-500">
              был {formatRelative(u.last_seen_at)} · id {u.user_id}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[u.status] ?? 'bg-slate-700/40 text-slate-300'}`}
          >
            {STATUS_LABEL[u.status] ?? u.status}
          </span>
        </li>
      ))}
    </ul>
  )
}

function formatUser(u: UserRow): string {
  const handle = u.username ? `@${u.username}` : null
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null
  if (handle && name) return `${handle} (${name})`
  if (handle) return handle
  if (name) return name
  return `user ${u.user_id}`
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return 'только что'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ч назад`
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} д назад`
  return new Date(iso).toLocaleDateString('ru-RU')
}
