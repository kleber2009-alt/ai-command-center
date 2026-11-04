'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, ArrowRight } from 'lucide-react'
import type { Bundle, BundleStatus, Slide } from '@/modules/bundles'
import { blockById } from '@/modules/bundles'

export const BUNDLE_STATUS: Record<BundleStatus, { label: string; cls: string; dot: string }> = {
  production: { label: 'Работает', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  beta:       { label: 'Обкатка',  cls: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',  dot: 'bg-indigo-500' },
  dev:        { label: 'В разработке', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
}

export function StatusBadge({ s }: { s: BundleStatus }) {
  const st = BUNDLE_STATUS[s]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${st.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
    </span>
  )
}

/** Короткая цепочка шагов: Шаг → Шаг → Шаг */
export function FlowChips({ b }: { b: Bundle }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {b.steps.map((s, i) => (
        <span key={s.title} className="flex items-center gap-1">
          <span className="text-[11px] text-slate-300 bg-slate-700/40 border border-slate-700/60 px-1.5 py-0.5 rounded">{s.title}</span>
          {i < b.steps.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600" />}
        </span>
      ))}
    </div>
  )
}

/** Цепочка шагов крупно, с номерами и блоками */
export function Pipeline({ b }: { b: Bundle }) {
  return (
    <ol className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {b.steps.map((s, i) => (
        <li key={s.title} className="relative bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
            <span className="text-sm font-semibold text-slate-100 leading-tight">{s.title}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{s.detail}</p>
          {s.block && <span className="inline-block mt-2 text-[10px] font-mono text-indigo-300/80 bg-indigo-500/10 px-1.5 py-0.5 rounded">{blockById(s.block).name}</span>}
        </li>
      ))}
    </ol>
  )
}

function ChatMock({ chat }: { chat: NonNullable<Slide['chat']> }) {
  return (
    <div className="w-full max-w-md mx-auto bg-[#0e1621] rounded-2xl p-4 space-y-2.5 border border-slate-700/50 shadow-xl">
      <div className="text-[10px] text-slate-500 text-center uppercase tracking-wider">пример переписки</div>
      {chat.map((m, i) => (
        <div key={i} className={`flex flex-col ${m.from === 'me' ? 'items-end' : 'items-start'}`}>
          <div className={`max-w-[88%] whitespace-pre-line text-[13px] leading-snug px-3 py-2 rounded-2xl ${
            m.from === 'me' ? 'bg-[#2b5278] text-white rounded-br-md' : 'bg-[#182533] text-slate-100 rounded-bl-md'}`}>
            {m.text}
          </div>
          {m.buttons && (
            <div className="grid grid-cols-3 gap-1 mt-1 max-w-[88%] w-full">
              {m.buttons.map(btn => (
                <span key={btn} className="text-[11px] text-center text-sky-200 bg-[#1f3347] rounded-md py-1 px-1 truncate">{btn}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SlideVisual({ s, active }: { s: Slide; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (active) v.play().catch(() => {})
    else v.pause()
  }, [active])

  if (s.media?.type === 'video')
    return <video ref={ref} src={s.media.src} poster={s.media.poster} muted loop playsInline controls controlsList="nodownload"
      className="max-h-full max-w-full rounded-xl bg-black object-contain" />
  if (s.media?.type === 'img')
    return <img src={s.media.src} alt={s.title} loading="lazy"
      className={`rounded-xl max-h-full ${s.media.fit === 'contain' ? 'max-w-full object-contain' : 'w-full h-full object-cover object-top'}`} />
  if (s.chat) return <ChatMock chat={s.chat} />
  if (s.io)
    return (
      <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5 text-center">
        <div className="px-5 py-4 rounded-2xl bg-slate-800 border border-slate-700 text-slate-200 text-base sm:text-lg font-medium max-w-[240px]">{s.io.from}</div>
        <ArrowRight className="w-7 h-7 text-indigo-400 rotate-90 sm:rotate-0 flex-shrink-0" />
        <div className="px-5 py-4 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-100 text-base sm:text-lg font-semibold max-w-[240px]">{s.io.to}</div>
      </div>
    )
  return <div className="text-6xl opacity-60">✦</div>
}

/** Мини-презентация связки: слайды со стрелками, точками, автопрокруткой и клавиатурой */
export function Presentation({ b }: { b: Bundle }) {
  const slides: Slide[] = [
    { title: b.name, text: b.pitch, io: { from: b.input, to: b.output } },
    ...b.demo,
  ]
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(false)
  const n = slides.length
  const go = useCallback((d: number) => setI(x => (x + d + n) % n), [n])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => go(1), 6000)
    return () => clearInterval(id)
  }, [auto, go])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go])

  const s = slides[i]
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="relative h-[340px] sm:h-[420px] bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 flex items-center justify-center p-4 sm:p-6">
        {slides.map((x, k) => (
          <div key={k} className={`absolute inset-0 flex items-center justify-center p-4 sm:p-6 transition-opacity duration-500 ${k === i ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <SlideVisual s={x} active={k === i} />
          </div>
        ))}
        <button onClick={() => go(-1)} aria-label="Назад"
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/70 text-slate-300 hover:text-white border border-slate-700/60">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={() => go(1)} aria-label="Дальше"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/70 text-slate-300 hover:text-white border border-slate-700/60">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 sm:p-5 border-t border-slate-800 min-h-[118px]">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Слайд {i + 1} / {n}</div>
          <button onClick={() => setAuto(a => !a)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-300">
            {auto ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}{auto ? 'пауза' : 'автопоказ'}
          </button>
        </div>
        <h3 className="text-base sm:text-lg font-bold text-slate-100">{s.title}</h3>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">{s.text}</p>
        <div className="flex gap-1.5 mt-3">
          {slides.map((_, k) => (
            <button key={k} onClick={() => setI(k)} aria-label={`Слайд ${k + 1}`}
              className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-indigo-500' : 'w-1.5 bg-slate-700 hover:bg-slate-600'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
