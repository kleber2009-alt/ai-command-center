'use client'

import { FadeUp } from './FadeUp'

export function FinalCta() {
  return (
    <section id="cta" className="bg-ink border-b border-bone/10">
      <div className="max-w-7xl mx-auto px-6 py-32 md:py-48 text-center">
        <FadeUp>
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-lime mb-10">
            [ Готовы? ]
          </div>
        </FadeUp>
        <FadeUp delay={0.1}>
          <h2 className="font-serif text-5xl md:text-8xl leading-[0.95] tracking-tight max-w-5xl mx-auto">
            Через 30 дней ваш бизнес <span className="italic text-lime">работает без вас</span>.
          </h2>
        </FadeUp>
        <FadeUp delay={0.2}>
          <p className="mt-10 text-lg md:text-xl text-bone/60 max-w-2xl mx-auto leading-relaxed">
            Оставьте заявку — назначим короткий звонок, посмотрим на ваши процессы и скажем, какой тариф подойдёт.
          </p>
        </FadeUp>
        <FadeUp delay={0.3}>
          <a
            href="mailto:hello@ai-office.io"
            className="inline-block mt-12 bg-lime text-ink px-12 py-6 font-mono text-xs tracking-[0.25em] uppercase hover:bg-bone transition-colors"
          >
            Запустить AI-офис →
          </a>
        </FadeUp>
        <FadeUp delay={0.4}>
          <div className="mt-10 font-mono text-[11px] tracking-[0.2em] uppercase text-bone/40">
            Без обязательств · Аудит бесплатно
          </div>
        </FadeUp>
      </div>
    </section>
  )
}
