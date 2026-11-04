'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ExternalLink, Bot, Globe, Sparkles, Building2, Code2, Clock } from 'lucide-react'
import { BUNDLES, CATEGORIES, bundleBySlug, blockById, type Bundle } from '@/modules/bundles'
import { StatusBadge, Pipeline, Presentation } from '../bundle-ui'

const LAUNCH_ICON = { bot: Bot, site: Globe, skill: Sparkles, office: Building2, code: Code2 }

export default function BundlePage() {
  const { slug } = useParams<{ slug: string }>()
  const b = bundleBySlug(slug)

  if (!b) return (
    <div className="py-16 text-center space-y-3">
      <p className="text-slate-400">Связка «{slug}» не найдена.</p>
      <Link href="/modules" className="text-indigo-400 hover:text-indigo-300 text-sm">← ко всем готовым модулям</Link>
    </div>
  )

  const cat = CATEGORIES.find(c => c.id === b.category)!
  const related = BUNDLES.filter(x => x.slug !== b.slug && x.blocks.some(id => b.blocks.includes(id)))
    .map(x => ({ x, n: x.blocks.filter(id => b.blocks.includes(id)).length }))
    .sort((p, q) => q.n - p.n).slice(0, 4).map(p => p.x)

  return (
    <div className="animate-slide-in space-y-6">
      <Link href="/modules" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
        <ArrowLeft className="w-3.5 h-3.5" /> Готовые модули · {cat.label}
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-3xl flex-shrink-0">{b.emoji}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{b.name}</h1>
            <StatusBadge s={b.status} />
          </div>
          <p className="text-sm sm:text-base text-slate-300 mt-1 leading-snug">{b.pitch}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
        <Presentation b={b} />

        <div className="space-y-4">
          <Card title="Зачем">
            <p className="text-sm text-slate-300 leading-relaxed">{b.forWhom}</p>
          </Card>
          <Card title="Вход → результат">
            <dl className="text-sm space-y-2">
              <div><dt className="text-[11px] text-slate-500 uppercase tracking-wider">На входе</dt><dd className="text-slate-200">{b.input}</dd></div>
              <div><dt className="text-[11px] text-slate-500 uppercase tracking-wider">На выходе</dt><dd className="text-slate-200">{b.output}</dd></div>
              {b.time && <div className="flex items-center gap-1.5 text-slate-400 text-xs pt-1"><Clock className="w-3.5 h-3.5" />{b.time}</div>}
            </dl>
          </Card>
          <Card title="Где запустить">
            <ul className="space-y-1.5">
              {b.launch.map(l => {
                const Icon = LAUNCH_ICON[l.kind]
                const inner = <><Icon className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{l.label}</span>{l.url && <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />}</>
                return (
                  <li key={l.label}>
                    {l.url
                      ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200">{inner}</a>
                      : <span className="flex items-center gap-2 text-sm text-slate-300">{inner}</span>}
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Как работает — по шагам</h2>
        <Pipeline b={b} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Блоки связки">
          <ul className="space-y-1.5">
            {b.blocks.map(id => {
              const bl = blockById(id)
              return <li key={id} className="text-sm"><span className="text-slate-200">{bl.name}</span> <span className="text-slate-500">— {bl.what}</span></li>
            })}
          </ul>
        </Card>
        <Card title="Проекты, на которых держится">
          <div className="flex flex-wrap gap-1.5">
            {b.projects.map(p => (
              <Link key={p} href={`/projects/${p}`} className="text-xs font-mono text-slate-300 bg-slate-800 border border-slate-700/60 hover:border-indigo-500/40 hover:text-indigo-300 px-2 py-1 rounded">
                {p}
              </Link>
            ))}
          </div>
          {b.notes && <p className="text-xs text-slate-500 mt-3">{b.notes}</p>}
        </Card>
      </div>

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Связки на тех же блоках</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {related.map(x => <Related key={x.slug} b={x} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
      <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </section>
  )
}

function Related({ b }: { b: Bundle }) {
  return (
    <Link href={`/modules/${b.slug}`} className="block bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 hover:border-slate-600 transition-all">
      <div className="flex items-center gap-2"><span className="text-lg">{b.emoji}</span><span className="text-sm font-semibold text-slate-100 leading-tight">{b.name}</span></div>
      <p className="text-xs text-slate-400 mt-1 leading-snug line-clamp-2">{b.pitch}</p>
    </Link>
  )
}
