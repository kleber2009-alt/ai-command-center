'use client'

import { FadeUp } from './FadeUp'

const ITEMS = [
  {
    n: '01',
    title: 'ChatGPT для контента',
    body: 'Связка GPT + ваш бренд-голос. Посты, рассылки, скрипты вебинаров, описания курсов — за минуты, не за дни.',
    tags: ['Контент', 'SMM', 'Email'],
  },
  {
    n: '02',
    title: 'AI для поддержки клиентов',
    body: 'Чат-бот на базе вашей базы знаний. Отвечает в Telegram, на сайте и в почте 24/7. Доводит до покупки.',
    tags: ['Telegram', 'Сайт', 'Email'],
  },
  {
    n: '03',
    title: 'Автоматизированные воронки',
    body: 'AI-сегментация лидов, персональные цепочки писем, динамические офферы. Конверсия x2 без увеличения трафика.',
    tags: ['Воронки', 'CRM', 'A/B'],
  },
  {
    n: '04',
    title: 'Аналитика-дашборд',
    body: 'Один экран, где видно деньги, лидов, ретеншн и точки роста. AI подсказывает, что починить в первую очередь.',
    tags: ['BI', 'Метрики', 'AI-инсайты'],
  },
]

export function Solution() {
  return (
    <section id="included" className="border-b border-bone/10">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <FadeUp>
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-6">
            [ 02 — Решение ]
          </div>
          <h2 className="font-serif text-4xl md:text-6xl leading-[1] tracking-tight max-w-4xl mb-16">
            Что вы <span className="italic text-lime">получите</span> за 30 дней.
          </h2>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-[2px]">
          {ITEMS.map((it, i) => (
            <FadeUp key={it.n} delay={i * 0.08}>
              <div className="bg-bone/5 border border-bone/10 p-8 md:p-12 h-full flex flex-col">
                <div className="flex items-start justify-between gap-6 mb-8">
                  <div className="outline-num font-serif text-7xl md:text-8xl leading-none">
                    {it.n}
                  </div>
                  <div className="flex flex-wrap gap-[2px] justify-end max-w-[60%]">
                    {it.tags.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[10px] tracking-[0.15em] uppercase border border-bone/20 px-2 py-1 text-bone/60"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <h3 className="font-serif text-3xl md:text-4xl mb-5 leading-tight">
                  {it.title}
                </h3>
                <p className="text-bone/65 leading-relaxed text-lg">{it.body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}
