'use client'
import { Copy, LayoutGrid } from 'lucide-react'
import type { CarouselContent } from '@/lib/types'

function formatForCopy(c: CarouselContent): string {
  return c.slides.map(s => `Слайд ${s.n}: ${s.title}\n${s.body}`).join('\n\n')
}

export default function CarouselView({ carousel }: { carousel: CarouselContent }) {
  return (
    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-cyan-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
            Карусель · {carousel.slides.length} слайдов
          </h3>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(formatForCopy(carousel))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
        >
          <Copy className="w-3 h-3" /> Копировать всё
        </button>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
        {carousel.slides.map(slide => (
          <div key={slide.n} className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4 relative">
            <div className="absolute top-2 right-2 text-[10px] text-slate-600 font-mono">#{slide.n}</div>
            <div className="text-sm font-semibold text-slate-100 mb-2 pr-8">{slide.title}</div>
            <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{slide.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
