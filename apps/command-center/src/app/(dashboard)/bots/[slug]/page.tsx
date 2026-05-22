import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, Send, Lock, ExternalLink, BookOpen, GitBranch, MessageSquare,
  Brain, ChevronRight, CheckCircle2, Circle, Clock, Globe,
} from 'lucide-react'
import { BOTS, KIND_STYLE, TRAINING_STYLE, getBot } from '@/lib/bots-data'

export function generateStaticParams() {
  return BOTS.map(b => ({ slug: b.slug }))
}

const PROMPT_ROLE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  system:  { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', label: 'system' },
  tool:    { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    label: 'tool' },
  handler: { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'handler' },
  user:    { bg: 'bg-slate-500/10',   text: 'text-slate-400',   label: 'user' },
}

const TRAINING_KIND_ICON: Record<string, string> = {
  rag: '📚',
  'fine-tune': '🎯',
  feedback: '🔁',
  config: '⚙️',
  'voice-clone': '🎙️',
}

export default function BotKBPage({ params }: { params: { slug: string } }) {
  const b = getBot(params.slug)
  if (!b) notFound()

  const s = KIND_STYLE[b.kind]

  return (
    <div className="animate-slide-in space-y-6">
      {/* Breadcrumb */}
      <Link href="/bots"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
        <ArrowLeft className="w-3 h-3" /> Боты
      </Link>

      {/* Header */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-slate-700/40 flex items-center justify-center text-3xl flex-shrink-0">
            {b.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-100">{b.name}</h1>
              <span className={`text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
                {s.label}
              </span>
            </div>
            <a href={b.url} target="_blank" rel="noopener noreferrer"
              className="text-sm font-mono text-indigo-400 hover:text-indigo-300 transition-colors">
              {b.handle}
            </a>
            <p className="text-sm text-slate-300 mt-2 leading-snug">{b.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {b.kind === 'internal' ? (
            <a href={b.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-700/40 border border-slate-600/50 hover:bg-slate-700/60 transition-all">
              <Lock className="w-3 h-3" /> Открыть в Telegram
            </a>
          ) : (
            <a href={b.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 border border-indigo-500 hover:bg-indigo-500 transition-all">
              <Send className="w-3 h-3" /> Открыть в Telegram
            </a>
          )}
          {b.site && (
            <a href={b.site} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-300 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/20 transition-all">
              <Globe className="w-3 h-3" /> Сайт <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>

      {/* Jump nav */}
      <nav className="flex flex-wrap gap-2">
        <SectionChip href="#docs" icon={BookOpen}>Документация</SectionChip>
        <SectionChip href="#workflow" icon={GitBranch}>Скрипт работы</SectionChip>
        <SectionChip href="#prompts" icon={MessageSquare}>Промпты</SectionChip>
        <SectionChip href="#training" icon={Brain}>Обучение модели</SectionChip>
      </nav>

      {/* Documentation */}
      <section id="docs" className="scroll-mt-4">
        <SectionTitle icon={BookOpen}>Документация</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {b.documentation.map((d, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="text-xs font-bold text-slate-100 mb-1.5">{d.title}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow / state-machine */}
      <section id="workflow" className="scroll-mt-4">
        <SectionTitle icon={GitBranch}>Скрипт работы</SectionTitle>
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
          {b.workflow.map((w, i) => (
            <div key={w.step}
              className={`px-4 py-3 flex items-start gap-3 ${i > 0 ? 'border-t border-slate-700/40' : ''}`}>
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-mono font-bold text-indigo-300">
                {w.step}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-sm font-medium text-slate-100">{w.title}</div>
                  {w.trigger && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      <Clock className="w-2.5 h-2.5" /> {w.trigger}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{w.detail}</p>
                {w.output && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                    <ChevronRight className="w-2.5 h-2.5" /> {w.output}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Prompts */}
      <section id="prompts" className="scroll-mt-4">
        <SectionTitle icon={MessageSquare}>Промпты</SectionTitle>
        <div className="space-y-2">
          {b.prompts.map((p, i) => {
            const r = PROMPT_ROLE_STYLE[p.role] ?? PROMPT_ROLE_STYLE.user
            return (
              <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <div className="text-sm font-medium text-slate-100">{p.name}</div>
                  <span className={`text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded ${r.bg} ${r.text}`}>
                    {r.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-2">{p.purpose}</p>
                {p.source && (
                  <div className="text-[10px] font-mono text-slate-500 bg-slate-900/40 border border-slate-700/40 rounded px-2 py-1 inline-block">
                    {p.source}
                  </div>
                )}
                {p.excerpt && (
                  <pre className="mt-2 text-[11px] font-mono text-slate-300 bg-slate-900/60 border border-slate-700/40 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                    {p.excerpt}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Training */}
      <section id="training" className="scroll-mt-4">
        <SectionTitle icon={Brain}>Обучение модели</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {b.training.map((t, i) => {
            const st = TRAINING_STYLE[t.status]
            return (
              <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">{TRAINING_KIND_ICON[t.kind] ?? '•'}</span>
                    <div className="text-sm font-medium text-slate-100">{t.title}</div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded ${st.bg} ${st.text} flex-shrink-0`}>
                    {st.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{t.detail}</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-200 mb-3 uppercase tracking-wider">
      <Icon className="w-4 h-4 text-indigo-400" />
      {children}
    </h2>
  )
}

function SectionChip({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  return (
    <a href={href}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-slate-300 bg-slate-800/50 border border-slate-700/50 hover:border-indigo-500/40 hover:text-indigo-300 transition-all">
      <Icon className="w-3 h-3" />
      {children}
    </a>
  )
}
