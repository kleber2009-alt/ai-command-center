'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, Users, BookOpen, DollarSign, Activity } from 'lucide-react'

type Point = {
  date: string
  signups: number
  completions: number
  activeUsers: number
  mrr: number
}

type Metrics = {
  totalUsers: number
  activeUsers7d: number
  paidUsers: number
  mrr: number
  conversionRate: string
  completionRate: string
}

export default function MetricsPage() {
  const [series, setSeries] = useState<Point[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [tsRes, mRes] = await Promise.all([
        fetch('/api/metrics/timeseries'),
        fetch('/api/metrics'),
      ])
      const ts = await tsRes.json()
      const m = await mRes.json()
      setSeries(ts.series ?? [])
      setMetrics(m)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Метрики</h1>
          <p className="text-sm text-slate-500 mt-0.5">Динамика за последние 30 дней</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="MRR"
          subtitle={metrics ? `$${metrics.mrr} сейчас` : '—'}
          Icon={DollarSign}
          tone="emerald"
          points={series.map(p => p.mrr)}
          labels={series.map(p => p.date)}
          format={v => `$${v}`}
        />
        <ChartCard
          title="DAU (за 7 дней)"
          subtitle={metrics ? `${metrics.activeUsers7d} активных сегодня` : '—'}
          Icon={Activity}
          tone="indigo"
          points={series.map(p => p.activeUsers)}
          labels={series.map(p => p.date)}
        />
        <ChartCard
          title="Регистрации"
          subtitle={metrics ? `${metrics.totalUsers} всего` : '—'}
          Icon={Users}
          tone="violet"
          points={series.map(p => p.signups)}
          labels={series.map(p => p.date)}
        />
        <ChartCard
          title="Пройденные уроки"
          subtitle={metrics ? `${metrics.completionRate}% completion` : '—'}
          Icon={BookOpen}
          tone="amber"
          points={series.map(p => p.completions)}
          labels={series.map(p => p.date)}
        />
      </div>

      <FunnelCard metrics={metrics} />
    </div>
  )
}

// ─── Chart card ──────────────────────────────────────────────────────

const TONES: Record<string, { stroke: string; fill: string; text: string; bg: string; border: string }> = {
  emerald: { stroke: '#10b981', fill: 'rgba(16,185,129,0.15)',  text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  indigo:  { stroke: '#6366f1', fill: 'rgba(99,102,241,0.15)',  text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20'  },
  violet:  { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.15)', text: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20'  },
  amber:   { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.15)',  text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
  rose:    { stroke: '#f43f5e', fill: 'rgba(244,63,94,0.15)',   text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20'    },
}

function ChartCard({
  title, subtitle, Icon, tone, points, labels, format,
}: {
  title: string
  subtitle: string
  Icon: any
  tone: string
  points: number[]
  labels: string[]
  format?: (v: number) => string
}) {
  const t = TONES[tone] ?? TONES.indigo
  const max = Math.max(1, ...points)
  const total = points.reduce((s, n) => s + n, 0)
  const fmt = format ?? ((v: number) => String(v))

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded ${t.bg} border ${t.border} flex items-center justify-center`}>
            <Icon className={`w-3.5 h-3.5 ${t.text}`} />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200">{title}</div>
            <div className="text-[10px] text-slate-500">{subtitle}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold ${t.text} font-mono tabular-nums`}>{fmt(total)}</div>
          <div className="text-[10px] text-slate-600">за 30 дней</div>
        </div>
      </div>
      <div className="p-4">
        <Sparkline points={points} max={max} stroke={t.stroke} fill={t.fill} labels={labels} format={fmt} />
      </div>
    </div>
  )
}

function Sparkline({
  points, max, stroke, fill, labels, format,
}: { points: number[]; max: number; stroke: string; fill: string; labels: string[]; format: (v: number) => string }) {
  const W = 560
  const H = 110
  const pad = 4
  if (points.length === 0) {
    return <div className="text-xs text-slate-600 py-6 text-center">Нет данных</div>
  }
  const stepX = (W - pad * 2) / Math.max(1, points.length - 1)
  const coords = points.map((v, i) => {
    const x = pad + i * stepX
    const y = H - pad - (v / max) * (H - pad * 2)
    return [x, y] as const
  })
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${path} L${coords[coords.length - 1][0].toFixed(1)},${H - pad} L${coords[0][0].toFixed(1)},${H - pad} Z`

  const last = points[points.length - 1]
  const firstLabel = labels[0]?.slice(5) // MM-DD
  const lastLabel = labels[labels.length - 1]?.slice(5)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        <path d={area} fill={fill} />
        <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" />
        {coords.length > 0 && (
          <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.5" fill={stroke} />
        )}
      </svg>
      <div className="flex items-center justify-between mt-2 text-[10px] text-slate-600 font-mono">
        <span>{firstLabel}</span>
        <span className="text-slate-500">сегодня: {format(last)}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  )
}

// ─── Funnel ──────────────────────────────────────────────────────────

function FunnelCard({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
        Загрузка воронки…
      </div>
    )
  }
  const total = metrics.totalUsers
  const active = metrics.activeUsers7d
  const paid = metrics.paidUsers
  const stages = [
    { label: 'Регистрации',  count: total,  pct: 100 },
    { label: 'Активные 7д',  count: active, pct: total > 0 ? Math.round((active / total) * 100) : 0 },
    { label: 'Платные',      count: paid,   pct: total > 0 ? Math.round((paid / total) * 100) : 0 },
  ]
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/40 flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Воронка пользователей</h3>
      </div>
      <div className="p-4 space-y-3">
        {stages.map((s, i) => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-300">{s.label}</span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {s.count} <span className="text-slate-600">· {s.pct}%</span>
              </span>
            </div>
            <div className="h-2 bg-slate-700/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  i === 0 ? 'bg-violet-500' : i === 1 ? 'bg-indigo-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${s.pct}%` }}
              />
            </div>
          </div>
        ))}
        <div className="pt-3 border-t border-slate-700/40 grid grid-cols-2 gap-3 text-xs">
          <Mini label="Конверсия free→paid" value={`${metrics.conversionRate}%`} target="4%" />
          <Mini label="Completion rate" value={`${metrics.completionRate}%`} target="50%" />
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value, target }: { label: string; value: string; target: string }) {
  return (
    <div className="bg-slate-700/20 rounded-lg p-3">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-bold text-slate-200 font-mono tabular-nums">{value}</span>
        <span className="text-[10px] text-slate-600">цель {target}</span>
      </div>
    </div>
  )
}
