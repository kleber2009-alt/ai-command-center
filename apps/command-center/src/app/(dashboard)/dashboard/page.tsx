'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, ExternalLink, ArrowRight } from 'lucide-react'

type Project = {
  slug: string
  name: string
  emoji: string
  tagline: string | null
  status: 'production' | 'dev' | 'paused' | 'archived'
  description: string
  technologies: string[]
  links: { label: string; url: string; kind: string }[]
  sort_order: number
  milestones_total: number
  milestones_done: number
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  production: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500', label: 'Live' },
  dev:        { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20',  dot: 'bg-indigo-500',  label: 'Dev' },
  paused:     { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   dot: 'bg-amber-500',   label: 'Pause' },
  archived:   { bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/20',   dot: 'bg-slate-500',   label: 'Archive' },
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/projects')
      const d = await r.json()
      setProjects(d.projects ?? [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = statusFilter ? projects.filter(p => p.status === statusFilter) : projects
  const counts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {})
  const totalMilestones = projects.reduce((s, p) => s + p.milestones_total, 0)
  const doneMilestones = projects.reduce((s, p) => s + p.milestones_done, 0)

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Проекты</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Загрузка…' : `${projects.length} проектов · ${doneMilestones}/${totalMilestones} этапов сделано`}
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <FilterChip active={statusFilter === ''} onClick={() => setStatusFilter('')}>
          Все · {projects.length}
        </FilterChip>
        {(['production', 'dev', 'paused', 'archived'] as const).map(s => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${STATUS_STYLE[s].dot}`} />
            {STATUS_STYLE[s].label} · {counts[s] ?? 0}
          </FilterChip>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(p => <ProjectCard key={p.slug} p={p} />)}
        {filtered.length === 0 && !loading && (
          <div className="col-span-full text-center py-12 text-sm text-slate-500">
            Нет проектов в этой категории
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ p }: { p: Project }) {
  const s = STATUS_STYLE[p.status]
  const progress = p.milestones_total > 0 ? Math.round((p.milestones_done / p.milestones_total) * 100) : 0
  const live = p.links.find(l => l.kind === 'live')

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:bg-slate-800/70 hover:border-slate-600 transition-all flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-slate-700/40 flex items-center justify-center text-2xl flex-shrink-0">
            {p.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/projects/${p.slug}`} className="text-base font-bold text-slate-100 hover:text-indigo-300 truncate">
                {p.name}
              </Link>
              <span className={`text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
                {s.label}
              </span>
            </div>
            {p.tagline && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{p.tagline}</p>}
          </div>
        </div>

        {p.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {p.technologies.slice(0, 5).map(t => (
              <span key={t} className="text-[10px] font-mono text-slate-500 bg-slate-700/30 px-1.5 py-0.5 rounded">
                {t}
              </span>
            ))}
            {p.technologies.length > 5 && (
              <span className="text-[10px] font-mono text-slate-600 px-1">
                +{p.technologies.length - 5}
              </span>
            )}
          </div>
        )}

        {p.milestones_total > 0 && (
          <div className="mb-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
              <span className="uppercase tracking-wider font-medium">Roadmap</span>
              <span className="font-mono">{p.milestones_done}/{p.milestones_total} · {progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-700/40 bg-slate-800/30 flex items-center gap-2">
        {live && (
          <a href={live.url} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 border border-indigo-500 hover:bg-indigo-500 transition-all">
            Открыть <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <Link href={`/projects/${p.slug}`}
          className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs text-slate-300 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/20 transition-all ${live ? '' : 'flex-1'}`}>
          Roadmap <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs transition-all border font-mono tabular-nums ${
        active
          ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
          : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
      }`}>
      {children}
    </button>
  )
}
