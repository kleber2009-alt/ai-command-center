'use client'

import { FadeUp } from './FadeUp'

const STEPS = [
  {
    n: '01',
    day: 'День 1–5',
    title: 'Аудит',
    body: 'Разбираем ваш бизнес по швам: процессы, команда, метрики, узкие места. Составляем карту внедрения AI с точным ROI по каждому инструменту.',
  },
  {
    n: '02',
    day: 'День 6–25',
    title: 'Настройка',
    body: 'Подключаем и обучаем все AI-инструменты под ваш бренд-голос, продукты и аудиторию. Интегрируем с вашей CRM, рассылками и сайтом.',
  },
  {
    n: '03',
    day: 'День 26–30',
    title: 'Запуск',
    body: 'Передаём готовый AI-офис, обучаем команду, контролируем первую неделю работы. Если что-то ломается — чиним сами.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-bone/10">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <FadeUp>
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-6">
            [ 03 — Процесс ]
          </div>
          <h2 className="font-serif text-4xl md:text-6xl leading-[1] tracking-tight max-w-4xl mb-20">
            От аудита до запуска — <span className="italic text-azure">30 дней</span>.
          </h2>
        </FadeUp>

        <div className="relative">
          <div className="absolute left-0 right-0 top-[88px] h-px bg-bone/15 hidden md:block" />
          <div className="grid md:grid-cols-3 gap-[2px]">
            {STEPS.map((s, i) => (
              <FadeUp key={s.n} delay={i * 0.15}>
                <div className="relative bg-ink border border-bone/10 p-8 md:p-10 h-full">
                  <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-lime mb-6">
                    {s.day}
                  </div>
                  <div className="relative z-10 mb-6">
                    <div className="w-4 h-4 bg-lime hidden md:block" />
                  </div>
                  <div className="outline-num font-serif text-6xl leading-none mb-6">
                    {s.n}
                  </div>
                  <h3 className="font-serif text-3xl md:text-4xl mb-4 leading-tight">
                    {s.title}
                  </h3>
                  <p className="text-bone/65 leading-relaxed">{s.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
