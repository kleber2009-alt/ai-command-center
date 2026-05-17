'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, FileText, TriangleAlert, CircleCheck, TrendingUp, CheckSquare } from 'lucide-react'
import Link from 'next/link'

type Briefing = {
  date: string
  summary: string
  risks: string[]
  growth: string
  forecast: string
  actions: {
    id: string
    agent_id: string
    agent_name: string
    agent_emoji: string
    text: string
    impact: string
    created_at: string
  }[]
  metrics: {
    totalUsers: number
    activeUsers7d: number
    paidUsers: number
    mrr: number
    conversionRate: string
    completionRate: string
  }
}

export default function BriefingPage() {
  const [data, setData] = useState<Briefing | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/briefing')
      const d = await res.json()
      if (!d.error) setData(d)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const dateStr = data
    ? new Date(data.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Дневной брифинг</h1>
          <p className="text-sm text-slate-500 mt-0.5">{dateStr} · сгенерировано из live-данных</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {/* Summary */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Итог дня</h3>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">
          {data?.summary ?? (loading ? 'Загрузка…' : 'Нет данных')}
        </p>
      </div>

      {/* Risks + growth + forecast in 3-col */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TriangleAlert className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Метрики под риском</h3>
          </div>
          {data?.risks.length ? (
            <ul className="space-y-2 text-xs text-slate-300">
              {data.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 bg-amber-400/5 border border-amber-400/10 rounded-lg p-2.5 leading-snug">
                  <span className="text-amber-400 mt-0.5">●</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-400">Все ключевые метрики в норме.</p>
          )}
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Динамика</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-3">{data?.growth ?? '—'}</p>
          {data && (
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-700/40">
              <Mini label="MRR" value={`$${data.metrics.mrr}`} />
              <Mini label="DAU 7d" value={String(data.metrics.activeUsers7d)} />
              <Mini label="Конверсия" value={`${data.metrics.conversionRate}%`} />
              <Mini label="Completion" value={`${data.metrics.completionRate}%`} />
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CircleCheck className="w-3.5 h-3.5 text-indigo-400" />
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Прогноз</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{data?.forecast ?? '—'}</p>
          <div className="mt-3 text-[10px] text-slate-600 leading-relaxed">
            Считается из текущего MRR и тренда регистраций за последние 7 vs 14 дней.
          </div>
        </div>
      </div>

      {/* Pending actions */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Действия в работе ({data?.actions.length ?? 0})
            </h3>
          </div>
          <Link href="/tasks" className="text-xs text-indigo-400 hover:text-indigo-300">
            Все задачи →
          </Link>
        </div>
        {!data?.actions.length ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            Нет pending-задач. Запусти команду на дашборде.
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {data.actions.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-700/20">
                <span className="text-base flex-shrink-0 mt-0.5">{a.agent_emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-0.5">
                    {a.agent_name}
                  </div>
                  <div className="text-sm text-slate-200 leading-snug">{a.text}</div>
                  <div className="text-[11px] text-emerald-400 mt-0.5">{a.impact}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm font-bold text-slate-200 font-mono tabular-nums">{value}</div>
    </div>
  )
}
