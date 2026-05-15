'use client'

import { FadeUp } from './FadeUp'

const PAINS = [
  {
    n: '01',
    title: 'Вы делаете всё руками',
    body: 'Письма, посты, ответы клиентам, отчёты. Каждый день одно и то же — а свободного времени нет.',
  },
  {
    n: '02',
    title: 'Команда тонет в рутине',
    body: 'Менеджеры пишут шаблонные ответы, маркетологи постят вручную, продажники теряют лиды. Деньги утекают.',
  },
  {
    n: '03',
    title: 'Конкуренты уже на AI',
    body: 'Пока вы думаете «нужен ли мне AI», они уже сократили издержки на 40% и удвоили выручку.',
  },
]

export function Pain() {
  return (
    <section className="border-b border-bone/10">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <FadeUp>
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-6">
            [ 01 — Проблема ]
          </div>
          <h2 className="font-serif text-4xl md:text-6xl leading-[1] tracking-tight max-w-4xl mb-16">
            Если что-то из этого <span className="italic text-azure">про вас</span> — читайте дальше.
          </h2>
        </FadeUp>

        <div className="grid md:grid-cols-3 gap-[2px]">
          {PAINS.map((p, i) => (
            <FadeUp key={p.n} delay={i * 0.1}>
              <div className="bg-bone/5 border border-bone/10 p-8 md:p-10 h-full">
                <div className="outline-num font-serif text-7xl md:text-8xl leading-none mb-8">
                  {p.n}
                </div>
                <h3 className="font-serif text-2xl md:text-3xl mb-4 leading-tight">
                  {p.title}
                </h3>
                <p className="text-bone/65 leading-relaxed">{p.body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}
