'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, Search } from 'lucide-react'
import { LinkChip, type ProjectLink } from '@/components/LinkChip'

type Project = {
  slug: string
  name: string
  emoji: string
  tagline: string | null
  status: 'production' | 'dev' | 'paused' | 'archived'
  links: ProjectLink[]
}

const STATUS_LABEL: Record<string, string> = {
  production: 'Live', dev: 'Dev', paused: 'Pause', archived: 'Archive',
}

// Every project and every one of its links on a single page.
export default function LinksPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/projects')
      const d = await r.json()
      setProjects(d.projects ?? [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const needle = q.trim().toLowerCase()
  const visible = projects
    .filter(p => p.links.length > 0)
    .filter(p => !needle
      || p.name.toLowerCase().includes(needle)
      || p.slug.includes(needle)
      || p.links.some(l => l.label.toLowerCase().includes(needle) || l.url.toLowerCase().includes(needle)))
  const total = visible.reduce((s, p) => s + p.links.length, 0)

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Ссылки</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Загрузка…' : `${visible.length} проектов · ${total} ссылок`}
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-300 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      <label className="flex items-center gap-2 bg-slate-800/30 border border-slate-700/40 rounded-xl px-3 py-2">
        <Search className="w-4 h-4 text-slate-500" />
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Поиск по проекту или адресу"
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none" />
      </label>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl divide-y divide-slate-700/40">
        {visible.map(p => (
          <div key={p.slug} className="p-4 flex flex-col md:flex-row md:items-start gap-3">
            <div className="md:w-56 flex-shrink-0 flex items-center gap-2.5">
              <span className="text-xl">{p.emoji}</span>
              <div className="min-w-0">
                <Link href={`/projects/${p.slug}`} className="text-sm font-semibold text-slate-100 hover:text-indigo-300 truncate block">
                  {p.name}
                </Link>
                <span className="text-[10px] uppercase tracking-wider font-mono text-slate-500">
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            </div>
            <div className="flex-1 flex flex-wrap gap-2">
              {p.links.map(l => <LinkChip key={l.url + l.label} l={l} />)}
            </div>
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div className="text-center py-12 text-sm text-slate-500">Ничего не найдено</div>
        )}
      </div>
    </div>
  )
}
