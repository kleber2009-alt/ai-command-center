'use client'

import { FadeUp } from './FadeUp'

const QUOTES = [
  {
    quote:
      'За месяц закрыли вопрос с поддержкой клиентов — бот отвечает на 80% запросов, оставшиеся 20% идут менеджеру с готовым контекстом. Сэкономили двух человек в штате.',
    name: 'Анна Воронова',
    role: 'Школа дизайна, 12k учеников',
  },
  {
    quote:
      'Раньше я писал прогревы по три дня. Теперь — час на бриф, час на правки, рассылка ушла. Выручка с запусков +37% за квартал.',
    name: 'Михаил Резников',
    role: 'Курсы по копирайтингу',
  },
  {
    quote:
      'Дашборд показывает то, что я раньше собирала вручную в десяти таблицах. И главное — AI говорит, где у меня дыра в воронке. Реально как штатный аналитик.',
    name: 'Екатерина Лагутина',
    role: 'Онлайн-школа английского',
  },
]

export function Testimonials() {
  return (
    <section className="border-b border-bone/10">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <FadeUp>
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-6">
            [ 05 — Кейсы ]
          </div>
          <h2 className="font-serif text-4xl md:text-6xl leading-[1] tracking-tight max-w-4xl mb-16">
            Что говорят <span className="italic text-azure">владельцы школ</span>.
          </h2>
        </FadeUp>

        <div className="grid md:grid-cols-3 gap-[2px]">
          {QUOTES.map((q, i) => (
            <FadeUp key={q.name} delay={i * 0.1}>
              <figure className="bg-bone/5 border border-bone/10 p-8 md:p-10 h-full flex flex-col">
                <div className="font-serif text-5xl text-lime leading-none mb-6">
                  &ldquo;
                </div>
                <blockquote className="font-serif text-xl md:text-2xl leading-snug flex-1 mb-8">
                  {q.quote}
                </blockquote>
                <figcaption className="border-t border-bone/15 pt-5">
                  <div className="font-serif text-lg">{q.name}</div>
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-bone/55 mt-1">
                    {q.role}
                  </div>
                </figcaption>
              </figure>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}
