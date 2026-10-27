import { ExternalLink } from 'lucide-react'

export type ProjectLink = { label: string; url: string; kind: string }

const KIND_STYLE: Record<string, { label: string; cls: string }> = {
  live:  { label: 'Сайт',     cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  admin: { label: 'Админка',  cls: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  api:   { label: 'API',      cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  repo:  { label: 'Код',      cls: 'text-slate-300 border-slate-600/50 bg-slate-700/30' },
  docs:  { label: 'Docs',     cls: 'text-slate-300 border-slate-600/50 bg-slate-700/30' },
  other: { label: 'Ещё',      cls: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10' },
}

// One project link: kind badge, label and host; opens in a new tab.
export function LinkChip({ l }: { l: ProjectLink }) {
  const k = KIND_STYLE[l.kind] ?? KIND_STYLE.other
  const host = l.url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}
      className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-700/50 bg-slate-900/40 hover:border-slate-500 transition-all max-w-full">
      <span className={`text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${k.cls}`}>{k.label}</span>
      <span className="text-xs text-slate-200 truncate">{l.label}</span>
      <span className="hidden sm:inline text-[11px] text-slate-500 font-mono truncate">{host}</span>
      <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
    </a>
  )
}
