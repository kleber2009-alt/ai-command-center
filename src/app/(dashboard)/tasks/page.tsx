'use client'
import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Filter, RefreshCw, CheckCircle2, Circle, XCircle, Loader2 } from 'lucide-react'
import { AI_AGENTS } from '@/lib/agents'

type Task = {
  id: string
  agent_id: string
  agent_name: string
  agent_emoji: string
  text: string
  impact: string
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
  run_id: string | null
  created_at: string
  completed_at: string | null
}

const STATUS_FILTERS = [
  { value: '',            label: 'Все' },
  { value: 'pending',     label: 'Pending' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done',        label: 'Сделано' },
  { value: 'skipped',     label: 'Skipped' },
] as const

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (agentFilter) params.set('agent', agentFilter)
      if (statusFilter) params.set('status', statusFilter)
      params.set('limit', '200')
      const res = await fetch(`/api/tasks?${params}`)
      const d = await res.json()
      setTasks(d.tasks ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [agentFilter, statusFilter])

  async function patch(id: string, status: Task['status']) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
    } catch {
      load()
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, in_progress: 0, done: 0, skipped: 0 }
    for (const t of tasks) c[t.status] = (c[t.status] ?? 0) + 1
    return c
  }, [tasks])

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Задачи</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Загрузка…' : `${tasks.length} в текущей выборке`}
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Pending" value={counts.pending} Icon={Circle} tone="slate" />
        <StatTile label="В работе" value={counts.in_progress} Icon={Loader2} tone="amber" />
        <StatTile label="Сделано" value={counts.done} Icon={CheckCircle2} tone="emerald" />
        <StatTile label="Skipped" value={counts.skipped} Icon={XCircle} tone="rose" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider font-medium">Фильтры</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={agentFilter === ''} onClick={() => setAgentFilter('')}>Все агенты</FilterChip>
          {AI_AGENTS.map(a => (
            <FilterChip key={a.id} active={agentFilter === a.id} onClick={() => setAgentFilter(a.id)}>
              <span className="mr-1">{a.emoji}</span>{a.name}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(s => (
            <FilterChip key={s.value} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        {tasks.length === 0 && !loading ? (
          <div className="px-4 py-12 text-center">
            <CheckSquare className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {agentFilter || statusFilter ? 'Нет задач по этим фильтрам' : 'Задач пока нет. Запусти команду на дашборде.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {tasks.map(t => (
              <TaskRow key={t.id} task={t} onStatus={s => patch(t.id, s)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskRow({ task, onStatus }: { task: Task; onStatus: (s: Task['status']) => void }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3 hover:bg-slate-700/20 transition-colors">
      <span className="text-base flex-shrink-0 mt-0.5">{task.agent_emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">{task.agent_name}</span>
          <span className="text-[10px] text-slate-600">·</span>
          <span className="text-[10px] text-slate-600">{formatTime(task.created_at)}</span>
        </div>
        <div className={`text-sm leading-snug ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
          {task.text}
        </div>
        <div className="text-[11px] text-emerald-400 mt-0.5">{task.impact}</div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <StatusButton active={task.status === 'pending'}     onClick={() => onStatus('pending')}     Icon={Circle}        title="Pending" />
        <StatusButton active={task.status === 'in_progress'} onClick={() => onStatus('in_progress')} Icon={Loader2}       title="В работе" tone="amber" />
        <StatusButton active={task.status === 'done'}        onClick={() => onStatus('done')}        Icon={CheckCircle2}  title="Сделано" tone="emerald" />
        <StatusButton active={task.status === 'skipped'}     onClick={() => onStatus('skipped')}     Icon={XCircle}       title="Skip"    tone="rose" />
      </div>
    </div>
  )
}

function StatusButton({ Icon, active, onClick, title, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    slate:   active ? 'text-slate-200 bg-slate-700/60' : 'text-slate-600 hover:text-slate-400',
    amber:   active ? 'text-amber-400 bg-amber-400/10' : 'text-slate-600 hover:text-amber-400',
    emerald: active ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-600 hover:text-emerald-400',
    rose:    active ? 'text-rose-400 bg-rose-400/10' : 'text-slate-600 hover:text-rose-400',
  }
  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${tones[tone]}`}>
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs transition-all border ${
        active
          ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
          : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
      }`}>
      {children}
    </button>
  )
}

function StatTile({ label, value, Icon, tone }: { label: string; value: number; Icon: any; tone: string }) {
  const tones: Record<string, { bg: string; border: string; text: string }> = {
    slate:   { bg: 'bg-slate-800/50',  border: 'border-slate-700/50',  text: 'text-slate-300'  },
    amber:   { bg: 'bg-amber-500/5',   border: 'border-amber-500/20',  text: 'text-amber-400'  },
    emerald: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    rose:    { bg: 'bg-rose-500/5',    border: 'border-rose-500/20',   text: 'text-rose-400'   },
  }
  const t = tones[tone] ?? tones.slate
  return (
    <div className={`${t.bg} border ${t.border} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${t.text}`} />
      </div>
      <div className={`text-2xl font-bold ${t.text} font-mono tabular-nums`}>{value}</div>
    </div>
  )
}

function formatTime(ts: string) {
  const d = new Date(ts)
  const diffMs = Date.now() - d.getTime()
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
