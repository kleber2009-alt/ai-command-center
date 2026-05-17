'use client'
import { useEffect, useState } from 'react'
import { Settings as Cog, RotateCcw, Check, AlertCircle, Server, Database } from 'lucide-react'

type Prompt = {
  agent_id: string
  agent_name: string
  agent_emoji: string
  prompt: string
  default_prompt: string
  overridden: boolean
  updated_at: string | null
}

type Save = 'idle' | 'saving' | 'saved' | 'error'

export default function SettingsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [save, setSave] = useState<Record<string, Save>>({})
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/prompts')
      const d = await res.json()
      setPrompts(d.prompts ?? [])
      setDrafts(Object.fromEntries((d.prompts ?? []).map((p: Prompt) => [p.agent_id, p.prompt])))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function savePrompt(agentId: string) {
    setSave(s => ({ ...s, [agentId]: 'saving' }))
    try {
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, prompt: drafts[agentId] }),
      })
      if (!res.ok) throw new Error('save failed')
      setSave(s => ({ ...s, [agentId]: 'saved' }))
      setTimeout(() => setSave(s => ({ ...s, [agentId]: 'idle' })), 2000)
      load()
    } catch {
      setSave(s => ({ ...s, [agentId]: 'error' }))
    }
  }

  async function resetPrompt(agentId: string) {
    setSave(s => ({ ...s, [agentId]: 'saving' }))
    try {
      await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, prompt: null }),
      })
      setSave(s => ({ ...s, [agentId]: 'saved' }))
      setTimeout(() => setSave(s => ({ ...s, [agentId]: 'idle' })), 2000)
      load()
    } catch {
      setSave(s => ({ ...s, [agentId]: 'error' }))
    }
  }

  return (
    <div className="animate-slide-in space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Настройки</h1>
        <p className="text-sm text-slate-500 mt-0.5">Промпты AI-агентов и инфо о подключении</p>
      </div>

      {/* Connection info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoTile Icon={Database} label="База данных" value="Postgres 16 · self-hosted" hint="ai-sales/code/docker-compose.yml" />
        <InfoTile Icon={Server} label="Reverse proxy" value="Caddy 2 + Let's Encrypt" hint="ai-sales/code/Caddyfile" />
      </div>

      {/* Prompts */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Cog className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Промпты агентов</h2>
        </div>
        {loading ? (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
            Загрузка…
          </div>
        ) : (
          <div className="space-y-3">
            {prompts.map(p => {
              const draft = drafts[p.agent_id] ?? ''
              const changed = draft !== p.prompt
              const s = save[p.agent_id] ?? 'idle'
              return (
                <div key={p.agent_id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.agent_emoji}</span>
                      <span className="text-sm font-semibold text-slate-200">{p.agent_name}</span>
                      <span className="text-[10px] font-mono text-slate-600 uppercase">{p.agent_id}</span>
                      {p.overridden && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
                          override
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.overridden && (
                        <button onClick={() => resetPrompt(p.agent_id)}
                          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                          <RotateCcw className="w-3 h-3" /> reset
                        </button>
                      )}
                      <button onClick={() => savePrompt(p.agent_id)} disabled={!changed || s === 'saving'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          changed
                            ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500'
                            : 'bg-slate-800 border-slate-700/50 text-slate-600'
                        } disabled:opacity-60`}>
                        {s === 'saved'
                          ? <><Check className="w-3 h-3" /> Сохранено</>
                          : s === 'error'
                          ? <><AlertCircle className="w-3 h-3" /> Ошибка</>
                          : s === 'saving'
                          ? 'Сохраняю…'
                          : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <textarea
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [p.agent_id]: e.target.value }))}
                      rows={4}
                      className="w-full bg-slate-900/70 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono leading-relaxed focus:border-indigo-500/50 focus:outline-none resize-y"
                    />
                    {p.overridden && p.updated_at && (
                      <div className="text-[10px] text-slate-600">
                        Последнее изменение: {new Date(p.updated_at).toLocaleString('ru-RU')}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoTile({ Icon, label, value, hint }: { Icon: any; label: string; value: string; hint: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-slate-700/40 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
        <div className="text-sm font-medium text-slate-200">{value}</div>
        <div className="text-[10px] text-slate-600 font-mono mt-0.5 truncate">{hint}</div>
      </div>
    </div>
  )
}
