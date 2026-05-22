'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ExternalLink, Github, FileText, Wrench, ShieldCheck, Plus, Check, Circle, Loader2, Trash2, Pencil, Save, X } from 'lucide-react'

type LinkItem = { label: string; url: string; kind: string }
type Project = {
  slug: string
  name: string
  emoji: string
  tagline: string | null
  status: 'production' | 'dev' | 'paused' | 'archived'
  description: string
  technologies: string[]
  links: LinkItem[]
  sort_order: number
}
type Milestone = {
  id: string
  ordinal: number
  title: string
  notes: string | null
  status: 'done' | 'in_progress' | 'planned'
  completed_at: string | null
}

const STATUS_LABEL: Record<string, string> = { production: 'Live', dev: 'Dev', paused: 'Pause', archived: 'Archive' }
const STATUS_STYLE: Record<string, string> = {
  production: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  dev:        'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  paused:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  archived:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
}
const LINK_ICONS: Record<string, any> = {
  live:  ExternalLink,
  repo:  Github,
  docs:  FileText,
  api:   Wrench,
  admin: ShieldCheck,
  other: ExternalLink,
}

export default function ProjectDetail() {
  const params = useParams<{ slug: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Project>>({})

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/projects/${params.slug}`)
      const d = await r.json()
      if (d.project) {
        setProject(d.project)
        setMilestones(d.milestones ?? [])
        setDraft(d.project)
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [params.slug])

  async function patchMilestone(id: string, fields: Partial<Milestone>) {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, ...fields } : m))
    await fetch(`/api/milestones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
  }
  async function deleteMilestone(id: string) {
    if (!confirm('Удалить этап?')) return
    setMilestones(prev => prev.filter(m => m.id !== id))
    await fetch(`/api/milestones/${id}`, { method: 'DELETE' })
  }
  async function addMilestone(title: string) {
    const r = await fetch(`/api/projects/${params.slug}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, status: 'planned' }),
    })
    if (r.ok) {
      const m = await r.json()
      setMilestones(prev => [...prev, m])
    }
  }
  async function saveProject() {
    await fetch(`/api/projects/${params.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name, emoji: draft.emoji, tagline: draft.tagline,
        status: draft.status, description: draft.description,
        technologies: draft.technologies, links: draft.links,
      }),
    })
    setEditing(false)
    load()
  }

  if (loading && !project) {
    return <div className="animate-slide-in text-center py-12 text-sm text-slate-500">Загрузка…</div>
  }
  if (!project) {
    return (
      <div className="animate-slide-in text-center py-12">
        <p className="text-sm text-slate-500">Проект не найден</p>
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 inline-block">← Все проекты</Link>
      </div>
    )
  }

  const done = milestones.filter(m => m.status === 'done').length
  const total = milestones.length

  return (
    <div className="animate-slide-in space-y-5">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
        <ArrowLeft className="w-3.5 h-3.5" /> Все проекты
      </Link>

      {/* Header card */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl bg-slate-700/40 flex items-center justify-center text-3xl flex-shrink-0">
            {editing
              ? <input value={draft.emoji ?? ''} onChange={e => setDraft({...draft, emoji: e.target.value})}
                  className="w-12 h-12 text-3xl bg-transparent text-center border border-slate-600 rounded" maxLength={4} />
              : project.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              {editing
                ? <input value={draft.name ?? ''} onChange={e => setDraft({...draft, name: e.target.value})}
                    className="text-xl font-bold bg-slate-900/70 border border-slate-700 rounded px-2 py-0.5 text-slate-100" />
                : <h1 className="text-xl font-bold text-slate-100">{project.name}</h1>}
              {editing
                ? <select value={draft.status} onChange={e => setDraft({...draft, status: e.target.value as any})}
                    className="text-xs bg-slate-900/70 border border-slate-700 rounded px-2 py-0.5 text-slate-200">
                    <option value="production">Live</option>
                    <option value="dev">Dev</option>
                    <option value="paused">Pause</option>
                    <option value="archived">Archive</option>
                  </select>
                : <span className={`text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded border ${STATUS_STYLE[project.status]}`}>
                    {STATUS_LABEL[project.status]}
                  </span>}
            </div>
            {editing
              ? <input value={draft.tagline ?? ''} onChange={e => setDraft({...draft, tagline: e.target.value})}
                  placeholder="tagline" className="w-full text-sm bg-slate-900/70 border border-slate-700 rounded px-2 py-0.5 text-slate-300" />
              : project.tagline && <p className="text-sm text-slate-400">{project.tagline}</p>}
          </div>
          <div className="flex-shrink-0">
            {editing
              ? <div className="flex gap-1">
                  <button onClick={saveProject} className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10"><Save className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setDraft(project); setEditing(false) }} className="p-1.5 rounded text-slate-500 hover:bg-slate-700/50"><X className="w-3.5 h-3.5" /></button>
                </div>
              : <button onClick={() => setEditing(true)} className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50">
                  <Pencil className="w-3.5 h-3.5" />
                </button>}
          </div>
        </div>

        {/* Description */}
        {editing
          ? <textarea value={draft.description ?? ''} onChange={e => setDraft({...draft, description: e.target.value})}
              rows={5} className="w-full text-sm bg-slate-900/70 border border-slate-700 rounded p-3 text-slate-300 leading-relaxed" />
          : project.description && <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{project.description}</p>}

        {/* Tech tags */}
        {project.technologies.length > 0 && !editing && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {project.technologies.map(t => (
              <span key={t} className="text-[11px] font-mono text-slate-400 bg-slate-700/30 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        )}
        {editing && (
          <div className="mt-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Технологии (через запятую)</div>
            <input
              value={(draft.technologies ?? []).join(', ')}
              onChange={e => setDraft({...draft, technologies: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
              className="w-full text-sm bg-slate-900/70 border border-slate-700 rounded px-3 py-2 text-slate-300" />
          </div>
        )}
      </div>

      {/* Links */}
      {project.links.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Ссылки</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {project.links.map((l, i) => {
              const Icon = LINK_ICONS[l.kind] ?? LINK_ICONS.other
              return (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/20 transition-all">
                  <div className="w-8 h-8 rounded bg-slate-700/40 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200">{l.label}</div>
                    <div className="text-[10px] text-slate-600 font-mono truncate">{l.url}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Roadmap */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Roadmap</h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">{done}/{total}</span>
        </div>
        <div className="divide-y divide-slate-700/30">
          {milestones.map(m => <MilestoneRow key={m.id} m={m} onPatch={f => patchMilestone(m.id, f)} onDelete={() => deleteMilestone(m.id)} />)}
          <AddMilestone onAdd={addMilestone} />
        </div>
      </div>
    </div>
  )
}

function MilestoneRow({ m, onPatch, onDelete }: { m: Milestone; onPatch: (f: Partial<Milestone>) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(m.title)

  function cycle() {
    const next = m.status === 'planned' ? 'in_progress' : m.status === 'in_progress' ? 'done' : 'planned'
    onPatch({ status: next })
  }

  return (
    <div className="px-5 py-3 flex items-start gap-3 hover:bg-slate-700/10">
      <button onClick={cycle} className="mt-0.5 flex-shrink-0" title={m.status}>
        {m.status === 'done'
          ? <Check className="w-4 h-4 text-emerald-400" />
          : m.status === 'in_progress'
          ? <Loader2 className="w-4 h-4 text-amber-400" />
          : <Circle className="w-4 h-4 text-slate-600" />}
      </button>
      <div className="flex-1 min-w-0">
        {editing
          ? <input value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => { onPatch({ title }); setEditing(false) }}
              onKeyDown={e => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              autoFocus
              className="w-full text-sm bg-slate-900/70 border border-slate-700 rounded px-2 py-0.5 text-slate-200" />
          : <div onClick={() => setEditing(true)}
              className={`text-sm leading-snug cursor-text ${m.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
              {m.title}
            </div>}
        {m.notes && <div className="text-[11px] text-slate-500 mt-0.5">{m.notes}</div>}
      </div>
      <button onClick={onDelete} className="p-1 rounded text-slate-700 hover:text-rose-400 flex-shrink-0" title="Удалить">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function AddMilestone({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  function submit() {
    if (!title.trim()) return
    onAdd(title.trim())
    setTitle('')
  }
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <Plus className="w-4 h-4 text-slate-600 flex-shrink-0" />
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Добавить этап… (Enter)"
        className="flex-1 text-sm bg-transparent border-none outline-none text-slate-300 placeholder-slate-600"
      />
      {title && (
        <button onClick={submit} className="text-xs text-indigo-400 hover:text-indigo-300">
          Добавить
        </button>
      )}
    </div>
  )
}
