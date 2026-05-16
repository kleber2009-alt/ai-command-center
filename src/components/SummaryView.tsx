import { Sparkles } from 'lucide-react'
import type { Summary } from '@/lib/types'

export default function SummaryView({ summary }: { summary: Summary }) {
  return (
    <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-violet-400" />
        <h3 className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Саммари</h3>
      </div>
      <p className="text-sm text-slate-200 leading-relaxed mb-3">{summary.summary}</p>
      <ul className="space-y-1.5">
        {summary.bullets.map((b, i) => (
          <li key={i} className="text-sm text-slate-300 flex gap-2">
            <span className="text-violet-400 flex-shrink-0">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
