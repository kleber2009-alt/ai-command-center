'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, X, Loader2, CircleDot, CircleDashed, CircleAlert, CircleCheck, GripVertical,
} from 'lucide-react'
import {
  Task, TaskStatus, TaskPriority, TaskProject,
  TASK_STATUSES, STATUS_LABEL, PRIORITY_LABEL,
  TASK_PROJECTS, PROJECT_LABEL,
} from '@/lib/tasks-db'

const STATUS_COLORS: Record<TaskStatus, { col: string; chip: string; icon: any }> = {
  backlog:     { col: 'border-slate-700/40', chip: 'bg-slate-700/40 text-slate-300', icon: CircleDashed },
  in_progress: { col: 'border-indigo-500/30', chip: 'bg-indigo-500/15 text-indigo-300', icon: CircleDot },
  blocked:     { col: 'border-rose-500/30',   chip: 'bg-rose-500/15 text-rose-300',   icon: CircleAlert },
  done:        { col: 'border-emerald-500/30', chip: 'bg-emerald-500/15 text-emerald-300', icon: CircleCheck },
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:    'text-slate-500',
  medium: 'text-amber-400',
  high:   'text-rose-400',
}

export default function AdminPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [projectFilter, setProjectFilter] = useState<TaskProject | 'all'>('all')
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState<TaskStatus | null>(null)
  const [draft, setDraft] = useState<{ title: string; description: string; priority: TaskPriority; stage: string; project: TaskProject }>({
    title: '', description: '', priority: 'medium', stage: '', project: 'general',
  })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось загрузить задачи')
      } else {
        setTasks(data.items ?? [])
        setConfigured(data.configured !== false)
        setError(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Сетевая ошибка')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const stages = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach(t => { if (t.stage) set.add(t.stage) })
    return Array.from(set).sort()
  }, [tasks])

  const filtered = useMemo(() => {
    let list = tasks
    if (projectFilter !== 'all') list = list.filter(t => (t.project ?? 'general') === projectFilter)
    if (stageFilter === '(no stage)') return list.filter(t => !t.stage)
    if (stageFilter !== 'all') return list.filter(t => t.stage === stageFilter)
    return list
  }, [tasks, stageFilter, projectFilter])

  const projectCounts = useMemo(() => {
    const c: Record<TaskProject | 'all', number> = { all: tasks.length, transcribe: 0, ytdlp: 0, 'ai-office': 0, general: 0 }
    tasks.forEach(t => {
      const p = (t.project ?? 'general') as TaskProject
      c[p] = (c[p] ?? 0) + 1
    })
    return c
  }, [tasks])

  async function updateTask(id: string, patch: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } as Task : t))
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось обновить')
        load()
      } else {
        setTasks(prev => prev.map(t => t.id === id ? data : t))
      }
    } catch (e: any) {
      setError(e?.message || 'Сетевая ошибка')
      load()
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('Удалить задачу?')) return
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    } catch {}
    if (editing?.id === id) setEditing(null)
  }

  async function createTask(status: TaskStatus) {
    if (!draft.title.trim()) return
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim() || undefined,
          priority: draft.priority,
          stage: draft.stage.trim() || undefined,
          project: draft.project,
          status,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось создать задачу')
      } else {
        setTasks(prev => [...prev, data])
        setCreating(null)
        setDraft({ title: '', description: '', priority: 'medium', stage: '', project: 'general' })
      }
    } catch (e: any) {
      setError(e?.message || 'Сетевая ошибка')
    }
  }

  const countsByStatus = useMemo(() => {
    const c: Record<TaskStatus, number> = { backlog: 0, in_progress: 0, blocked: 0, done: 0 }
    filtered.forEach(t => { c[t.status] = (c[t.status] ?? 0) + 1 })
    return c
  }, [filtered])

  if (!configured) {
    return (
      <div className="text-slate-300 space-y-3">
        <h1 className="text-xl font-bold">Дашборд задач</h1>
        <p className="text-sm text-slate-400">
          Supabase не настроен. Добавьте <code>NEXT_PUBLIC_SUPABASE_URL</code> и <code>SUPABASE_SERVICE_KEY</code>,
          выполните миграции <code>001_transcripts.sql</code> и <code>003_tasks.sql</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Дашборд задач</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} задач{filtered.length === 1 ? 'а' : (filtered.length >= 2 && filtered.length <= 4) ? 'и' : ''}
            {' · '}
            <span className="text-slate-400">{countsByStatus.in_progress}</span> в работе{' · '}
            <span className="text-emerald-400">{countsByStatus.done}</span> готово
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stages.length > 0 && (
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="bg-slate-900/60 border border-slate-700 rounded-lg text-xs text-slate-200 px-2 py-1.5 focus:outline-none focus:border-indigo-500/60"
            >
              <option value="all">Все этапы</option>
              <option value="(no stage)">Без этапа</option>
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Project tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-slate-800 pb-0">
        {(['all', ...TASK_PROJECTS] as const).map(p => {
          const active = projectFilter === p
          const label = p === 'all' ? 'Все проекты' : PROJECT_LABEL[p]
          const count = projectCounts[p]
          return (
            <button
              key={p}
              onClick={() => setProjectFilter(p as TaskProject | 'all')}
              className={`px-3 py-1.5 text-xs rounded-t-lg border-b-2 transition-colors ${
                active
                  ? 'border-indigo-500 text-slate-100 bg-slate-800/40'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
              <span className="ml-1.5 text-[10px] text-slate-600">{count}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 text-sm text-slate-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> загружаем…
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {TASK_STATUSES.map(status => {
          const list = filtered.filter(t => t.status === status)
          const { col, chip, icon: Icon } = STATUS_COLORS[status]
          return (
            <div key={status} className={`bg-slate-800/30 border ${col} rounded-xl overflow-hidden flex flex-col`}>
              <div className="px-3 py-2.5 border-b border-slate-700/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{STATUS_LABEL[status]}</h3>
                  <span className="text-[10px] text-slate-600">{list.length}</span>
                </div>
                <button
                  onClick={() => { setCreating(status); setDraft({ title: '', description: '', priority: 'medium', stage: stageFilter !== 'all' && stageFilter !== '(no stage)' ? stageFilter : '', project: projectFilter !== 'all' ? projectFilter : 'general' }) }}
                  className="text-slate-500 hover:text-slate-200 transition-colors"
                  title="Новая задача"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2 space-y-2 min-h-[120px]">
                {list.map(task => (
                  <div
                    key={task.id}
                    onClick={() => setEditing(task)}
                    className="group bg-slate-900/40 hover:bg-slate-900/70 border border-slate-700/40 hover:border-slate-600 rounded-lg p-3 cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className={`text-[10px] mt-0.5 ${PRIORITY_COLORS[task.priority]}`} title={`приоритет: ${task.priority}`}>
                        ●
                      </span>
                      <div className="text-sm text-slate-100 leading-snug flex-1 min-w-0 break-words">
                        {task.title}
                      </div>
                    </div>
                    {task.description && (
                      <div className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 mb-1.5 pl-3">
                        {task.description}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-1.5 pl-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {projectFilter === 'all' && (
                          <span className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                            {PROJECT_LABEL[(task.project ?? 'general') as TaskProject]}
                          </span>
                        )}
                        {task.stage && (
                          <span className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400">
                            {task.stage}
                          </span>
                        )}
                        <span className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${chip}`}>
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                      </div>
                      <select
                        value={task.status}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateTask(task.id, { status: e.target.value as TaskStatus })}
                        className="text-[10px] bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-slate-400 focus:outline-none focus:border-indigo-500/60"
                      >
                        {TASK_STATUSES.map(s => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="text-[11px] text-slate-700 italic text-center py-3">Пусто</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create modal */}
      {creating && (
        <Modal onClose={() => setCreating(null)} title={`Новая задача · ${STATUS_LABEL[creating]}`}>
          <div className="space-y-3">
            <Field label="Название">
              <input
                autoFocus
                type="text"
                value={draft.title}
                onChange={e => setDraft({ ...draft, title: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
              />
            </Field>
            <Field label="Описание">
              <textarea
                rows={3}
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60 resize-none"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Этап">
                <input
                  type="text"
                  value={draft.stage}
                  onChange={e => setDraft({ ...draft, stage: e.target.value })}
                  placeholder="Foundation / Mini App / Polish"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
                />
              </Field>
              <Field label="Приоритет">
                <select
                  value={draft.priority}
                  onChange={e => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </Field>
            </div>
            <Field label="Проект">
              <select
                value={draft.project}
                onChange={e => setDraft({ ...draft, project: e.target.value as TaskProject })}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
              >
                {TASK_PROJECTS.map(p => (
                  <option key={p} value={p}>{PROJECT_LABEL[p]}</option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCreating(null)}
                className="px-3 py-2 text-xs text-slate-400 border border-slate-700 rounded-lg hover:text-slate-200 hover:border-slate-600 transition-all"
              >
                Отмена
              </button>
              <button
                onClick={() => createTask(creating)}
                disabled={!draft.title.trim()}
                className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-all"
              >
                Создать
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal onClose={() => setEditing(null)} title="Редактировать задачу">
          <EditForm
            task={editing}
            onChange={patch => updateTask(editing.id, patch)}
            onDelete={() => deleteTask(editing.id)}
          />
        </Modal>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/50 rounded-xl w-full max-w-lg shadow-2xl"
      >
        <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  )
}

function EditForm({ task, onChange, onDelete }: { task: Task; onChange: (patch: Partial<Task>) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [stage, setStage] = useState(task.stage ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [project, setProject] = useState<TaskProject>((task.project ?? 'general') as TaskProject)

  function flush() {
    const patch: Partial<Task> = {}
    if (title !== task.title) patch.title = title
    if ((description || null) !== task.description) patch.description = description || null
    if ((stage || null) !== task.stage) patch.stage = stage || null
    if (priority !== task.priority) patch.priority = priority
    if (status !== task.status) patch.status = status
    if (project !== (task.project ?? 'general')) patch.project = project
    if (Object.keys(patch).length) onChange(patch)
  }

  return (
    <div className="space-y-3">
      <Field label="Название">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={flush}
          className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
        />
      </Field>
      <Field label="Описание">
        <textarea
          rows={4}
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={flush}
          className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60 resize-none"
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Статус">
          <select
            value={status}
            onChange={e => { setStatus(e.target.value as TaskStatus); setTimeout(flush, 0) }}
            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
          >
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Этап">
          <input
            type="text"
            value={stage}
            onChange={e => setStage(e.target.value)}
            onBlur={flush}
            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
          />
        </Field>
        <Field label="Приоритет">
          <select
            value={priority}
            onChange={e => { setPriority(e.target.value as TaskPriority); setTimeout(flush, 0) }}
            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </Field>
      </div>
      <Field label="Проект">
        <select
          value={project}
          onChange={e => { setProject(e.target.value as TaskProject); setTimeout(flush, 0) }}
          className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60"
        >
          {TASK_PROJECTS.map(p => (
            <option key={p} value={p}>{PROJECT_LABEL[p]}</option>
          ))}
        </select>
      </Field>
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Удалить
        </button>
        <div className="text-[10px] text-slate-600">
          Обновлено {new Date(task.updated_at).toLocaleString('ru-RU')}
        </div>
      </div>
    </div>
  )
}
