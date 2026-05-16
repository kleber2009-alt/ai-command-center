'use client'
import { useEffect, useState } from 'react'
import { Bot, Activity, Zap } from 'lucide-react'
import { AI_AGENTS } from '@/lib/agents'

const ROLE_DESCRIPTIONS: Record<string, string> = {
  analyst: 'Анализирует метрики платформы, ищет аномалии в данных пользователей и конверсии. Формирует daily-инсайты для команды.',
  cfo:     'Считает MRR, прогнозирует кэш-флоу, рекомендует финансовые действия для достижения цели $10M/мес.',
  cmo:     'Планирует маркетинговые кампании, копирайт, охваты. Отвечает за привлечение и активацию.',
  cs:      'Отслеживает удержание, проактивно работает с неактивными, обрабатывает churn-сигналы.',
  ceo:     'Стратегические приоритеты, координация команды, фокус на главные ставки месяца.',
}

const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  indigo:  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  text: 'text-indigo-400',  dot: 'bg-indigo-500'  },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400',    dot: 'bg-rose-500'    },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400',   dot: 'bg-amber-500'   },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  text: 'text-violet-400',  dot: 'bg-violet-500'  },
}

type AgentStat = { agent_id: string; total: number; last_run: string | null }

export default function TeamPage() {
  const [stats, setStats] = useState<Record<string, AgentStat>>({})

  useEffect(() => {
    fetch('/api/team/stats')
      .then(r => r.ok ? r.json() : { stats: [] })
      .then((d: { stats: AgentStat[] }) => {
        const map: Record<string, AgentStat> = {}
        for (const s of d.stats) map[s.agent_id] = s
        setStats(map)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">AI Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">{AI_AGENTS.length} агента · модель claude-haiku-4-5</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">
          <Activity className="w-3.5 h-3.5" />
          Все агенты в строю
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {AI_AGENTS.map(agent => {
          const c = COLOR_CLASSES[agent.color] ?? COLOR_CLASSES.indigo
          const s = stats[agent.id]
          return (
            <div key={agent.id}
              className={`bg-slate-800/50 border ${c.border} rounded-xl p-5 hover:bg-slate-800/70 transition-all`}>
              <div className="flex items-start gap-4 mb-4">
                <div className="relative flex-shrink-0">
                  <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center text-2xl`}>
                    {agent.emoji}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${c.dot} border-2 border-slate-800`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-100 truncate">{agent.name}</h3>
                    <span className={`text-[10px] font-mono ${c.text} uppercase tracking-wider`}>{agent.id}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{agent.role}</p>
                </div>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                {ROLE_DESCRIPTIONS[agent.id] ?? 'Описание роли скоро появится.'}
              </p>

              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-700/40">
                <Stat label="Задач" value={s ? String(s.total) : '—'} />
                <Stat label="Last run" value={formatLastRun(s?.last_run)} />
                <Stat label="Status" value={s ? 'active' : 'idle'} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-700/40 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-300 mb-1">Как это работает</div>
          <p className="text-xs text-slate-500 leading-relaxed">
            На дашборде нажми <span className="text-slate-300 font-medium">«Запустить команду»</span> —
            каждый агент по очереди (analyst → cfo → cmo → cs → ceo) получит свой промпт,
            обратится к Claude Haiku и вернёт 2 задачи в JSON. Задачи попадают в раздел
            <span className="text-slate-300 font-medium"> Задачи</span> и БД.
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20">
          <Zap className="w-3 h-3" />
          P1
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm font-bold text-slate-300 font-mono tabular-nums truncate">{value}</div>
    </div>
  )
}

function formatLastRun(ts: string | null | undefined) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
