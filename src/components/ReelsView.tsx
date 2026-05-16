'use client'
import { Copy, Shuffle, Video } from 'lucide-react'
import type { ReelsContent } from '@/lib/types'

function Section({ label, text }: { label: string; text: string }) {
  if (!text) return null
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</div>
      <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
    </div>
  )
}

function formatForCopy(r: ReelsContent): string {
  const bodyText = r.body.map(b => `[${b.time}] ${b.text}`).join('\n')
  const onScreen = r.text_on_screen.length
    ? `\nText on screen:\n${r.text_on_screen.map(s => `• ${s}`).join('\n')}`
    : ''
  const hashtags = r.hashtags.length ? `\n\n${r.hashtags.join(' ')}` : ''
  return `HOOK: ${r.hook}\n\nPROMISE: ${r.promise}\n\nBODY:\n${bodyText}\n\nCTA: ${r.cta}${onScreen}\n\nCAPTION:\n${r.caption}${hashtags}`
}

export default function ReelsView({
  reels,
  variant,
}: {
  reels: ReelsContent
  variant: 'new' | 'remix'
}) {
  const isNew = variant === 'new'
  const Icon = isNew ? Video : Shuffle
  const title = isNew ? 'Рилс — новый сценарий' : 'Рилс — ремикс'
  const wrap = isNew ? 'bg-fuchsia-500/5 border-fuchsia-500/20' : 'bg-pink-500/5 border-pink-500/20'
  const header = isNew ? 'border-fuchsia-500/10' : 'border-pink-500/10'
  const icon = isNew ? 'text-fuchsia-400' : 'text-pink-400'
  const titleC = isNew ? 'text-fuchsia-300' : 'text-pink-300'
  return (
    <div className={`${wrap} border rounded-xl overflow-hidden`}>
      <div className={`px-5 py-3 border-b ${header} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${icon}`} />
          <h3 className={`text-xs font-semibold ${titleC} uppercase tracking-wider`}>{title}</h3>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(formatForCopy(reels))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
        >
          <Copy className="w-3 h-3" /> Копировать всё
        </button>
      </div>
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <Section label="HOOK · 0-3 сек" text={reels.hook} />
        <Section label="PROMISE · 3-7 сек" text={reels.promise} />
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Body</div>
          <div className="space-y-2">
            {reels.body.map((b, i) => (
              <div key={i} className="flex gap-3 bg-slate-900/40 rounded-lg p-3">
                <span className="text-[11px] text-slate-500 font-mono tabular-nums flex-shrink-0 w-16">{b.time}</span>
                <p className="text-sm text-slate-200 leading-relaxed flex-1">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
        <Section label="CTA · 50-60 сек" text={reels.cta} />
        {reels.text_on_screen.length > 0 && (
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Text on screen</div>
            <div className="flex flex-wrap gap-1.5">
              {reels.text_on_screen.map((s, i) => (
                <span key={i} className="text-xs text-slate-300 bg-slate-700/40 px-2 py-1 rounded">{s}</span>
              ))}
            </div>
          </div>
        )}
        <Section label="Caption" text={reels.caption} />
        {reels.hashtags.length > 0 && (
          <div className="text-xs text-indigo-400 font-mono break-words">{reels.hashtags.join(' ')}</div>
        )}
      </div>
    </div>
  )
}
