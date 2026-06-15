import type { ReactNode } from 'react'

export function OfficePageHeader({
  title,
  description,
  extra,
}: {
  title: string
  description: string
  extra?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">{description}</p>
      </div>
      {extra}
    </header>
  )
}

export function OfficePanel({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
}) {
  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      {eyebrow ? <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">{eyebrow}</div> : null}
      <h2 className="text-base font-semibold text-slate-100 mb-4">{title}</h2>
      {children}
    </section>
  )
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint: string
}) {
  return (
    <div className="bg-slate-900/70 border border-slate-700/50 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-100 mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-2 leading-relaxed">{hint}</div>
    </div>
  )
}

export function ToneBadge({
  tone,
  children,
}: {
  tone: 'critical' | 'high' | 'medium' | 'low' | 'pending' | 'approved' | 'deferred'
  children: ReactNode
}) {
  const styles: Record<string, string> = {
    critical: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    high: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    medium: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    low: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    approved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    deferred: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${styles[tone]}`}>
      {children}
    </span>
  )
}
