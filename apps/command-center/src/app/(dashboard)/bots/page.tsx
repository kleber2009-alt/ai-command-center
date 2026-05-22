import Link from 'next/link'
import { Send, CheckCircle2, Lock, BookOpen } from 'lucide-react'
import { BOTS, KIND_STYLE, type Bot } from '@/lib/bots-data'

export default function BotsPage() {
  const counts = BOTS.reduce<Record<string, number>>((acc, b) => {
    acc[b.kind] = (acc[b.kind] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="animate-slide-in space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Боты</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {BOTS.length} Telegram-ботов · {counts.product ?? 0} продуктовых · {counts.tool ?? 0} утилит · {counts.internal ?? 0} внутренних
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BOTS.map(b => <BotCard key={b.slug} b={b} />)}
      </div>
    </div>
  )
}

function BotCard({ b }: { b: Bot }) {
  const s = KIND_STYLE[b.kind]
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:bg-slate-800/70 hover:border-slate-600 transition-all flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-slate-700/40 flex items-center justify-center text-2xl flex-shrink-0">
            {b.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-base font-bold text-slate-100 truncate">{b.name}</div>
              <span className={`text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
                {s.label}
              </span>
            </div>
            <a href={b.url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-mono text-indigo-400 hover:text-indigo-300 transition-colors">
              {b.handle}
            </a>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-snug mb-3">{b.tagline}</p>
        <p className="text-xs text-slate-500 leading-relaxed mb-4">{b.description}</p>

        <div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-slate-500 mb-2">Функционал</div>
          <ul className="space-y-1.5">
            {b.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-snug">
                <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0 text-emerald-500/70" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-slate-700/40 bg-slate-800/30 flex items-center gap-2">
        {b.kind === 'internal' ? (
          <a href={b.url} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-700/40 border border-slate-600/50 hover:bg-slate-700/60 transition-all">
            <Lock className="w-3 h-3" /> Открыть
          </a>
        ) : (
          <a href={b.url} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 border border-indigo-500 hover:bg-indigo-500 transition-all">
            <Send className="w-3 h-3" /> Telegram
          </a>
        )}
        <Link href={`/bots/${b.slug}`}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 hover:text-indigo-200 transition-all">
          <BookOpen className="w-3 h-3" /> База знаний
        </Link>
      </div>
    </div>
  )
}
