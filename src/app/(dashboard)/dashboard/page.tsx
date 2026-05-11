'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, Play, Target, Calendar, TrendingUp, ArrowRight, TriangleAlert, CircleCheck } from 'lucide-react'
import { AI_AGENTS } from '@/lib/agents'

const BRIEFING = {
  summary: 'CFO фиксирует стабильный MRR. Конверсия free→paid на 1.2pp ниже цели. CMO предлагает кампанию для пользователей завершивших Level 0. CS Manager одобрил. Запуск сегодня.',
  risk: 'Конверсия free→paid: 2.8% (цель: 4%). Lesson completion rate: 38% (цель: 50%).',
  actions: [
    { emoji: '📣', text: 'Запустить кампанию для Level 0 completers', impact: '+15-20 заявок' },
    { emoji: '🤝', text: 'Проактивный outreach неактивных 3+ дней',  impact: 'Retention +5%' },
    { emoji: '✍️', text: 'Написать 3 Telegram-поста с хуками',        impact: 'Охваты +20%' },
    { emoji: '📊', text: 'Разбить воронку по сегментам',              impact: 'Найти слабое звено' },
  ],
  forecast: 'При текущей динамике MRR к концу месяца составит ~$4,800 (+$420 vs сейчас). Для достижения цели конверсия должна вырасти до 3.5%.',
}

function StatCard({ emoji, label, value, suffix, trend, trendColor, trendLabel }: any) {
  return (
    <div className={`bg-slate-800/50 border rounded-xl p-4 transition-all cursor-default group ${
      trendColor === 'rose' ? 'border-rose-500/20 hover:border-rose-500/40' :
      trendColor === 'emerald' ? 'border-emerald-500/20 hover:border-emerald-500/40' :
      'border-slate-700/50 hover:border-slate-600'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{emoji}</span>
          <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">{label}</span>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full mt-0.5 flex-shrink-0 ${
          trendColor === 'rose' ? 'bg-rose-500' :
          trendColor === 'emerald' ? 'bg-emerald-500' : 'bg-slate-600'
        }`} />
      </div>
      <div className="mb-2">
        <span className="text-2xl font-bold text-slate-100 font-mono tabular-nums">{value}</span>
        {suffix && <span className="text-sm text-slate-500 ml-1">{suffix}</span>}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-mono ${
          trendColor === 'rose' ? 'text-rose-400' :
          trendColor === 'emerald' ? 'text-emerald-400' : 'text-slate-400'
        }`}>
          <span>{trendColor === 'rose' ? '↓' : trendColor === 'emerald' ? '↑' : '→'}</span>
          <span>{trend}</span>
          {trendLabel && <span className="text-slate-600 ml-1">{trendLabel}</span>}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<any[]>([])

  async function loadMetrics() {
    setLoading(true)
    try {
      const res = await fetch('/api/metrics')
      const data = await res.json()
      setMetrics(data)
    } catch {
      // fallback demo data
      setMetrics({
        totalUsers: 3, activeUsers7d: 3, paidUsers: 0, mrr: 0,
        conversionRate: '0.0', completionRate: '0', daysLeft: 20,
        achieved: 7200000, monthGoal: 10000000, dailyNeeded: 140000, goalPercent: 72,
      })
    } finally {
      setLoading(false)
    }
  }

  async function runTeam() {
    setRunning(true)
    setTasks([])
    const statuses: Record<string, string> = {}

    for (const agent of AI_AGENTS) {
      statuses[agent.id] = 'thinking'
      setAgentStatuses({ ...statuses })
      await new Promise(r => setTimeout(r, 800 + Math.random() * 600))

      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agent.id, agentName: agent.name, agentRole: agent.role }),
        })
        const data = await res.json()
        statuses[agent.id] = 'done'
        setAgentStatuses({ ...statuses })
        if (data.tasks) setTasks(prev => [...prev, ...data.tasks.map((t: any) => ({ ...t, agent: agent.name, emoji: agent.emoji }))])
      } catch {
        statuses[agent.id] = 'error'
        setAgentStatuses({ ...statuses })
      }
    }
    setRunning(false)
  }

  useEffect(() => { loadMetrics() }, [])

  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const m = metrics

  return (
    <div className="animate-slide-in space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI Business Command Center</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadMetrics}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
            Обновить
          </button>
          <button onClick={runTeam} disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 disabled:opacity-50">
            <Play className="w-4 h-4" />
            {running ? 'Работаем...' : 'Запустить команду'}
          </button>
        </div>
      </div>

      {/* Goal Card */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 shadow-xl shadow-indigo-500/10">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Цель месяца</span>
            </div>
            <h2 className="text-lg font-bold text-slate-100">Выручка за месяц</h2>
          </div>
          <div className="text-xs font-mono px-2.5 py-1 rounded-full border text-indigo-400 bg-indigo-400/10 border-indigo-400/20">
            {m?.goalPercent ?? 72}%
          </div>
        </div>
        <div className="mb-4">
          <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700 bg-indigo-500" style={{ width: `${m?.goalPercent ?? 72}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Достигнуто</div>
            <div className="text-xl font-bold text-slate-100">₽{((m?.achieved ?? 7200000) / 1000000).toFixed(1)}M</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Цель</div>
            <div className="text-xl font-bold text-slate-400">₽{((m?.monthGoal ?? 10000000) / 1000000).toFixed(1)}M</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Остаток</div>
            <div className="text-xl font-bold text-rose-400">
              ₽{(((m?.monthGoal ?? 10000000) - (m?.achieved ?? 7200000)) / 1000000).toFixed(1)}M
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>Осталось {m?.daysLeft ?? 20} дней</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400">Нужно ₽{Math.round((m?.dailyNeeded ?? 140000) / 1000)}K/день</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard emoji="💰" label="MRR" value={`$${m?.mrr ?? 0}`} suffix="/мес" />
        <StatCard emoji="👥" label="Пользователей" value={m?.totalUsers ?? 3}
          trend="0.0%" trendLabel="+0 сегодня" />
        <StatCard emoji="📈" label="Конверсия" value={m?.conversionRate ?? 0} suffix="%"
          trend={`${m?.conversionRate ?? 0}%`} trendLabel="vs цель 4%" trendColor="rose" />
        <StatCard emoji="⚡" label="Активных 7д" value={m?.activeUsers7d ?? 3}
          trend="50.0%" trendLabel="100% retention" trendColor="emerald" />
        <StatCard emoji="⭐" label="Платных" value={m?.paidUsers ?? 0} />
        <StatCard emoji="📚" label="Завершение уроков" value={m?.completionRate ?? 0} suffix="%"
          trend="50.0%" trendLabel="vs цель 50%" trendColor="rose" />
      </div>

      {/* Team + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* AI Team */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Команда</h3>
            <span className="text-xs text-slate-600">
              {Object.values(agentStatuses).filter(s => s === 'done').length}/{AI_AGENTS.length} активны
            </span>
          </div>
          <div className="divide-y divide-slate-700/30">
            {AI_AGENTS.map(agent => {
              const status = agentStatuses[agent.id]
              return (
                <div key={agent.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-700/20 transition-colors">
                  <div className="relative flex-shrink-0">
                    <span className="text-lg">{agent.emoji}</span>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-800 ${
                      status === 'done' ? 'bg-emerald-500' :
                      status === 'thinking' ? 'bg-amber-500 animate-pulse' :
                      status === 'error' ? 'bg-rose-500' : 'bg-slate-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{agent.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{agent.role}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-[11px] font-medium ${
                      status === 'done' ? 'text-emerald-400' :
                      status === 'thinking' ? 'text-amber-400' : 'text-slate-500'
                    }`}>
                      {status === 'done' ? 'Готово' : status === 'thinking' ? 'Думает...' : 'Ожидает'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Последние задачи</h3>
            <Link href="/tasks" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
              Все <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {tasks.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-600">
              {running ? 'Генерируем задачи...' : 'Нет задач. Запустите цикл команды.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30 max-h-64 overflow-y-auto">
              {tasks.slice(0, 6).map((task, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-700/20">
                  <span className="text-base flex-shrink-0 mt-0.5">{task.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 leading-snug">{task.text}</div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">{task.impact}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Briefing */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Дневной брифинг</h3>
            <span className="text-[10px] text-slate-600">{today}</span>
          </div>
          <Link href="/briefing" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
            Подробнее <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 space-y-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Итог дня</div>
              <p className="text-sm text-slate-300 leading-relaxed">{BRIEFING.summary}</p>
            </div>
            <div className="flex items-start gap-2 bg-amber-400/5 border border-amber-400/10 rounded-lg p-3">
              <TriangleAlert className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">Метрики под риском</div>
                <p className="text-xs text-slate-400">{BRIEFING.risk}</p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Действия сегодня</div>
            <div className="space-y-2">
              {BRIEFING.actions.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-slate-700/30 rounded-lg p-2.5">
                  <span className="text-base flex-shrink-0 mt-0.5">{a.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 leading-snug">{a.text}</div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">{a.impact}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Финансовый прогноз</div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="flex items-start gap-2 mb-2">
                <CircleCheck className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-300 leading-relaxed">{BRIEFING.forecast}</p>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-slate-600">Сформировано AI-командой · автоматически</div>
          </div>
        </div>
      </div>
    </div>
  )
}
