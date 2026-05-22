'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, ChevronLeft, ChevronRight, Pencil, X, ImageDown } from 'lucide-react'

type Slide = { n: number; title: string; body: string }

type Template = {
  id: string
  label: string
  bgCSS: string
  titleColor: string
  bodyColor: string
  numColor: string
  accentBar?: string
  drawBg(ctx: CanvasRenderingContext2D, W: number, H: number): void
}

function mkGrad(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  stops: [number, string][],
): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, W, H)
  for (const [p, c] of stops) g.addColorStop(p, c)
  return g
}

const TEMPLATES: Template[] = [
  {
    id: 'night', label: 'Night',
    bgCSS: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    titleColor: '#ffffff', bodyColor: '#c4b5fd', numColor: 'rgba(255,255,255,0.18)',
    drawBg(ctx, W, H) {
      ctx.fillStyle = mkGrad(ctx, W, H, [[0, '#0f0c29'], [0.5, '#302b63'], [1, '#24243e']])
      ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'solar', label: 'Solar',
    bgCSS: 'linear-gradient(135deg, #f77062 0%, #fe5196 100%)',
    titleColor: '#ffffff', bodyColor: 'rgba(255,255,255,0.88)', numColor: 'rgba(255,255,255,0.3)',
    drawBg(ctx, W, H) {
      ctx.fillStyle = mkGrad(ctx, W, H, [[0, '#f77062'], [1, '#fe5196']])
      ctx.fillRect(0, 0, W, H)
    },
  },
  {
    id: 'arctic', label: 'Arctic',
    bgCSS: '#eef2ff', titleColor: '#1e1b4b', bodyColor: '#4338ca', numColor: 'rgba(0,0,0,0.1)',
    accentBar: '#6366f1',
    drawBg(ctx, W, H) {
      ctx.fillStyle = '#eef2ff'; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#6366f1'; ctx.fillRect(0, 0, W, 14)
    },
  },
  {
    id: 'ink', label: 'Ink',
    bgCSS: '#0d0d0d', titleColor: '#f5f5f5', bodyColor: '#737373', numColor: 'rgba(255,255,255,0.1)',
    accentBar: '#16a34a',
    drawBg(ctx, W, H) {
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#16a34a'; ctx.fillRect(0, 0, W, 10)
    },
  },
  {
    id: 'amber', label: 'Amber',
    bgCSS: 'linear-gradient(135deg, #78350f 0%, #92400e 100%)',
    titleColor: '#fef3c7', bodyColor: '#fcd34d', numColor: 'rgba(254,243,199,0.2)',
    drawBg(ctx, W, H) {
      ctx.fillStyle = mkGrad(ctx, W, H, [[0, '#78350f'], [1, '#92400e']])
      ctx.fillRect(0, 0, W, H)
    },
  },
]

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif'

function wrapTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
): number {
  const words = text.split(' ')
  let line = '', curY = y
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' '
    if (ctx.measureText(test).width > maxW && i > 0) {
      ctx.fillText(line.trim(), x, curY)
      line = words[i] + ' '
      curY += lh
    } else line = test
  }
  if (line.trim()) { ctx.fillText(line.trim(), x, curY); curY += lh }
  return curY
}

function renderSlideToCanvas(canvas: HTMLCanvasElement, slide: Slide, tpl: Template) {
  const W = 1080, H = 1080
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  tpl.drawBg(ctx, W, H)
  const pad = 90, maxW = W - pad * 2

  ctx.font = `300 32px ${FONT}`
  ctx.fillStyle = tpl.numColor
  ctx.textAlign = 'right'; ctx.fillText(`${slide.n}`, W - pad, pad + 20); ctx.textAlign = 'left'

  ctx.font = `700 66px ${FONT}`; ctx.fillStyle = tpl.titleColor
  const afterTitle = wrapTextOnCanvas(ctx, slide.title, pad, 240, maxW, 82)

  const sepY = afterTitle + 20
  ctx.strokeStyle = tpl.bodyColor + '55'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(pad, sepY); ctx.lineTo(pad + 56, sepY); ctx.stroke()

  ctx.font = `400 38px ${FONT}`; ctx.fillStyle = tpl.bodyColor
  wrapTextOnCanvas(ctx, slide.body, pad, sepY + 52, maxW, 56)
}

async function downloadPng(slide: Slide, tpl: Template) {
  const canvas = document.createElement('canvas')
  renderSlideToCanvas(canvas, slide, tpl)
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `slide-${String(slide.n).padStart(2, '0')}.png`,
  })
  a.click(); URL.revokeObjectURL(url)
}

function EditModal({ slide, onSave, onClose }: {
  slide: Slide; onSave: (s: Slide) => void; onClose: () => void
}) {
  const [title, setTitle] = useState(slide.title)
  const [body, setBody] = useState(slide.body)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-[#1c1c28] border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <span className="text-white/80 font-medium text-sm">Слайд {slide.n}</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-white/40 text-xs mb-2 uppercase tracking-wider">Заголовок</label>
            <textarea
              value={title}
              onChange={e => setTitle(e.target.value)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-white/40 text-xs mb-2 uppercase tracking-wider">Текст слайда</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/70 transition-colors">
            Отмена
          </button>
          <button
            onClick={() => { onSave({ ...slide, title, body }); onClose() }}
            className="px-5 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

const SAMPLE: Slide[] = [
  { n: 1, title: 'Как построить привычку за 21 день', body: 'Мозг запоминает повторяющиеся действия как автоматизм. 21 повторение подряд — и нейронная цепочка закрепляется навсегда.' },
  { n: 2, title: 'Маленький шаг важнее силы воли', body: 'Не нужна мотивация. Нужна система. 5 минут утром × 21 день = 7 часов практики без напряжения.' },
  { n: 3, title: 'Три рычага, которые работают', body: 'Trigger → Routine → Reward. Привяжи новое действие к уже существующей привычке — это сокращает время закрепления вдвое.' },
]

export default function CarouselEditorPage() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [current, setCurrent] = useState(0)
  const [tplId, setTplId] = useState('night')
  const [editing, setEditing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [noData, setNoData] = useState(false)

  const tpl = TEMPLATES.find(t => t.id === tplId) ?? TEMPLATES[0]
  const slide = slides[current]

  useEffect(() => {
    try {
      const raw = localStorage.getItem('carousel_slides')
      if (raw) {
        const parsed = JSON.parse(raw) as { slides: Slide[] }
        if (parsed.slides?.length) { setSlides(parsed.slides); return }
      }
    } catch {}
    setSlides(SAMPLE); setNoData(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return
      if (e.key === 'ArrowLeft') setCurrent(c => Math.max(0, c - 1))
      if (e.key === 'ArrowRight') setCurrent(c => Math.min(slides.length - 1, c + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length, editing])

  const updateSlide = useCallback((updated: Slide) => {
    setSlides(prev => prev.map(s => s.n === updated.n ? updated : s))
  }, [])

  const handleDownloadAll = async () => {
    setDownloading(true)
    for (const s of slides) {
      await downloadPng(s, tpl)
      await new Promise(r => setTimeout(r, 250))
    }
    setDownloading(false)
  }

  if (!slides.length) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  const S = 540
  const thumbSize = 72

  return (
    <div className="min-h-screen bg-[#080810] text-white flex flex-col" style={{ fontFamily: FONT }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] bg-[#0d0d1a]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/transcribe"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <p className="text-sm font-semibold text-white/90 leading-none">Дизайнер карусели</p>
            <p className="text-xs text-white/30 mt-0.5 leading-none">{slides.length} слайдов · 1080×1080 px</p>
          </div>
        </div>
        <button
          onClick={handleDownloadAll}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-all shadow-lg shadow-indigo-900/40"
        >
          <ImageDown className="w-4 h-4" />
          {downloading ? 'Скачиваю...' : `Скачать все (${slides.length})`}
        </button>
      </header>

      {noData && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2 text-center text-xs text-amber-400">
          Карусель не найдена — показан демо-пример. Откройте дизайнер из страницы транскрибации.
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* Center: preview */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-10 gap-5">

          {/* Template chips */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setTplId(t.id)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: t.bgCSS,
                  color: t.titleColor,
                  boxShadow: tplId === t.id
                    ? '0 0 0 2px #6366f1, 0 0 0 4px rgba(99,102,241,0.25)'
                    : 'none',
                  opacity: tplId === t.id ? 1 : 0.55,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Slide + nav */}
          <div className="flex items-center gap-3 w-full" style={{ maxWidth: S + 80 }}>
            <button
              onClick={() => setCurrent(c => Math.max(0, c - 1))}
              disabled={current === 0}
              className="w-9 h-9 flex-shrink-0 rounded-full bg-white/5 hover:bg-white/12 disabled:opacity-20 flex items-center justify-center transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div
              className="flex-1 relative overflow-hidden shadow-2xl"
              style={{ borderRadius: 20, aspectRatio: '1/1', background: tpl.bgCSS }}
            >
              {tpl.accentBar && (
                <div className="absolute inset-x-0 top-0 z-10" style={{ height: 7, background: tpl.accentBar }} />
              )}
              <div
                className="absolute font-light"
                style={{ right: '8%', top: '7%', fontSize: 'clamp(11px,2vw,15px)', color: tpl.numColor }}
              >
                {slide.n}
              </div>
              <div className="absolute inset-0 flex flex-col justify-center" style={{ padding: '10% 8.5%' }}>
                <div
                  className="font-bold leading-tight tracking-tight"
                  style={{ fontSize: 'clamp(18px,4vw,32px)', color: tpl.titleColor, lineHeight: 1.22, marginBottom: '3%' }}
                >
                  {slide.title}
                </div>
                <div style={{ height: 1.5, width: '5%', background: tpl.bodyColor, opacity: 0.35, marginBottom: '4%' }} />
                <div style={{ fontSize: 'clamp(12px,2.5vw,18px)', color: tpl.bodyColor, lineHeight: 1.75 }}>
                  {slide.body}
                </div>
              </div>
            </div>

            <button
              onClick={() => setCurrent(c => Math.min(slides.length - 1, c + 1))}
              disabled={current === slides.length - 1}
              className="w-9 h-9 flex-shrink-0 rounded-full bg-white/5 hover:bg-white/12 disabled:opacity-20 flex items-center justify-center transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <span className="text-white/25 text-xs tabular-nums">{current + 1} / {slides.length}</span>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/50 hover:text-white/90 transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
              Редактировать
            </button>
            <button
              onClick={() => downloadPng(slide, tpl)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/50 hover:text-white/90 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Этот слайд
            </button>
          </div>

          <p className="text-white/15 text-xs">← → стрелки для навигации</p>
        </div>

        {/* Slide strip sidebar */}
        <aside
          className="border-t lg:border-t-0 lg:border-l border-white/[0.06] bg-[#0d0d1a]/50 flex lg:flex-col gap-2.5 p-3 overflow-x-auto lg:overflow-y-auto"
          style={{ minWidth: thumbSize + 24 }}
        >
          {slides.map((s, i) => {
            const scale = thumbSize / S
            return (
              <button
                key={s.n}
                onClick={() => setCurrent(i)}
                className="relative flex-shrink-0 overflow-hidden transition-all"
                style={{
                  width: thumbSize, height: thumbSize,
                  borderRadius: 10,
                  boxShadow: i === current
                    ? '0 0 0 2.5px #6366f1'
                    : '0 0 0 1.5px rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    width: S, height: S,
                    position: 'absolute',
                    background: tpl.bgCSS,
                    pointerEvents: 'none',
                  }}
                >
                  {tpl.accentBar && (
                    <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 7, background: tpl.accentBar }} />
                  )}
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    padding: '10% 8.5%',
                  }}>
                    <div style={{ fontSize: 30, fontWeight: 700, color: tpl.titleColor, lineHeight: 1.25, marginBottom: 10 }}>
                      {s.title}
                    </div>
                    <div style={{ height: 1.5, width: 28, background: tpl.bodyColor, opacity: 0.35, marginBottom: 12 }} />
                    <div style={{ fontSize: 18, color: tpl.bodyColor, lineHeight: 1.65 }}>{s.body}</div>
                  </div>
                </div>
                <div
                  className="absolute bottom-1 right-1.5 font-mono"
                  style={{ fontSize: 9, zIndex: 1, color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                >
                  {s.n}
                </div>
              </button>
            )
          })}
        </aside>
      </main>

      {editing && slide && (
        <EditModal slide={slide} onSave={updateSlide} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}
