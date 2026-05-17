'use client'
import { useEffect, useState } from 'react'
import { Inbox, Instagram, Send, MessageSquare, User, RefreshCw, Filter } from 'lucide-react'

type Convo = {
  id: string
  channel: 'ig' | 'tg'
  status: 'active' | 'paused' | 'closed' | 'escalated'
  last_message_at: string | null
  message_count: number
  agent_is_active: boolean
  client_id: string
  client_name: string | null
  client_handle: string | null
  segment: string
  funnel_stage: string
  qual_score: number
  last_message: string | null
  last_direction: 'in' | 'out' | null
}

type Message = {
  id: string
  direction: 'in' | 'out'
  type: string
  author: string
  content: string | null
  agent_model: string | null
  created_at: string
}

const STAGE_COLORS: Record<string, string> = {
  hello:        'bg-slate-500/10 text-slate-400 border-slate-500/20',
  discovery:    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  pitch:        'bg-violet-500/10 text-violet-400 border-violet-500/20',
  objections:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  close:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  followup:     'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  closed_won:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed_lost:  'bg-rose-500/10 text-rose-400 border-rose-500/20',
}

const STATUS_FILTERS = [
  { v: '',          label: 'Все' },
  { v: 'active',    label: 'Активные' },
  { v: 'paused',    label: 'Pause' },
  { v: 'escalated', label: 'Эскалация' },
  { v: 'closed',    label: 'Закрытые' },
] as const

export default function ConversationsPage() {
  const [convos, setConvos] = useState<Convo[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ conversation: Convo; messages: Message[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function loadList() {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (statusFilter) p.set('status', statusFilter)
      const r = await fetch(`/api/conversations?${p}`)
      const d = await r.json()
      setConvos(d.conversations ?? [])
      if (!selectedId && d.conversations?.[0]) setSelectedId(d.conversations[0].id)
    } finally { setLoading(false) }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true)
    setDetail(null)
    try {
      const r = await fetch(`/api/conversations/${id}`)
      const d = await r.json()
      if (!d.error) setDetail(d)
    } finally { setDetailLoading(false) }
  }

  useEffect(() => { loadList() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter])
  useEffect(() => { if (selectedId) loadDetail(selectedId) }, [selectedId])

  return (
    <div className="animate-slide-in space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Диалоги</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Загрузка…' : `${convos.length} диалогов · live из ai-sales`}
          </p>
        </div>
        <button onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
        {STATUS_FILTERS.map(s => (
          <button key={s.v} onClick={() => setStatusFilter(s.v)}
            className={`px-3 py-1 rounded-full text-xs transition-all border ${
              statusFilter === s.v
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
            }`}>{s.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[60vh]">
        {/* List */}
        <div className="lg:col-span-5 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          {convos.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Inbox className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Диалогов нет. Дождись первого webhook'а из IG/TG.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30 max-h-[70vh] overflow-y-auto">
              {convos.map(c => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full px-3 py-3 flex items-start gap-3 text-left transition-colors ${
                    selectedId === c.id ? 'bg-indigo-600/10' : 'hover:bg-slate-700/20'
                  }`}>
                  <ChannelBadge channel={c.channel} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-slate-200 truncate">{c.client_name ?? c.client_handle ?? '—'}</span>
                      {c.client_handle && c.client_name && (
                        <span className="text-[10px] text-slate-600 font-mono">@{c.client_handle}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {c.last_direction === 'out' && <span className="text-slate-600">→ </span>}
                      {c.last_message ?? 'нет сообщений'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Tag color={STAGE_COLORS[c.funnel_stage] ?? STAGE_COLORS.hello}>{c.funnel_stage}</Tag>
                      <span className="text-[10px] text-slate-600 font-mono">qual {c.qual_score}</span>
                      {c.status === 'escalated' && <Tag color="bg-amber-500/10 text-amber-400 border-amber-500/20">!</Tag>}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                    {formatTime(c.last_message_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-7 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          {!selectedId ? (
            <div className="px-4 py-16 text-center">
              <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Выбери диалог слева</p>
            </div>
          ) : detailLoading || !detail ? (
            <div className="px-4 py-16 text-center text-sm text-slate-500">Загрузка диалога…</div>
          ) : (
            <ConversationDetail data={detail} />
          )}
        </div>
      </div>
    </div>
  )
}

function ConversationDetail({ data }: { data: { conversation: Convo; messages: Message[] } }) {
  const { conversation: c, messages } = data
  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      <div className="px-4 py-3 border-b border-slate-700/40 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-700/40 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-100">{c.client_name ?? c.client_handle ?? '—'}</div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ChannelBadge channel={c.channel} small />
            {c.client_handle && <span>@{c.client_handle}</span>}
            <span className="text-slate-600">·</span>
            <Tag color={STAGE_COLORS[c.funnel_stage] ?? STAGE_COLORS.hello}>{c.funnel_stage}</Tag>
            <span className="font-mono">qual {c.qual_score}</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">Нет сообщений</p>
        ) : messages.map(m => <MessageBubble key={m.id} m={m} />)}
      </div>
    </div>
  )
}

function MessageBubble({ m }: { m: Message }) {
  const isOut = m.direction === 'out'
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
        isOut
          ? 'bg-indigo-600/20 border border-indigo-500/20 text-slate-200'
          : 'bg-slate-700/40 border border-slate-700/40 text-slate-300'
      }`}>
        <div className="text-sm leading-snug whitespace-pre-wrap">{m.content ?? '(без текста)'}</div>
        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 font-mono">
          <span>{m.author}</span>
          {m.agent_model && <><span className="text-slate-700">·</span><span>{m.agent_model}</span></>}
          <span className="text-slate-700">·</span>
          <span>{formatTime(m.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

function ChannelBadge({ channel, small }: { channel: string; small?: boolean }) {
  const Icon = channel === 'ig' ? Instagram : Send
  const size = small ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const wrap = small
    ? 'inline-flex items-center justify-center'
    : 'w-8 h-8 rounded-lg bg-slate-700/40 flex items-center justify-center flex-shrink-0'
  return (
    <span className={wrap} title={channel}>
      <Icon className={`${size} text-slate-400`} />
    </span>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${color}`}>
      {children}
    </span>
  )
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  const m = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
