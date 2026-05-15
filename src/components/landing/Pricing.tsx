'use client'

import { FadeUp } from './FadeUp'

const TIERS = [
  {
    name: 'Start',
    price: '990',
    desc: 'Базовая настройка для тех, кто хочет попробовать AI без больших вложений.',
    features: [
      'Базовая настройка AI-офиса',
      '3 AI-инструмента на выбор',
      'Обучение по бренд-голосу',
      'Интеграция с одной платформой',
      'Передача доступов и инструкций',
      '7 дней поддержки после запуска',
    ],
    accent: false,
    cta: 'Выбрать Start',
  },
  {
    name: 'Pro',
    price: '2490',
    desc: 'Полный AI-офис под ключ. Всё, что нужно, чтобы бизнес работал сам.',
    features: [
      'Полный AI-офис под ключ',
      '7 AI-инструментов в связке',
      'Обучение бренд-голосу и продуктам',
      'Интеграция с CRM, рассылками, сайтом',
      'Персональные воронки и сегменты',
      'Аналитика-дашборд с AI-инсайтами',
      '30 дней сопровождения после запуска',
      'Приоритетная техподдержка',
    ],
    accent: true,
    cta: 'Выбрать Pro',
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="border-b border-bone/10">
      <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
        <FadeUp>
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-6">
            [ 04 — Цены ]
          </div>
          <h2 className="font-serif text-4xl md:text-6xl leading-[1] tracking-tight max-w-4xl mb-6">
            Один платёж. <span className="italic text-lime">Никаких подписок.</span>
          </h2>
          <p className="text-bone/60 max-w-2xl text-lg mb-16">
            Платите один раз — пользуетесь годами. Все лицензии на AI-инструменты остаются у вас.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-[2px]">
          {TIERS.map((t, i) => (
            <FadeUp key={t.name} delay={i * 0.15}>
              <div
                className={
                  'h-full p-10 md:p-12 flex flex-col ' +
                  (t.accent
                    ? 'border-2 border-lime bg-ink relative'
                    : 'bg-bone/5 border border-bone/10')
                }
              >
                {t.accent && (
                  <div className="absolute -top-px right-8 bg-lime text-ink font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1">
                    Рекомендуем
                  </div>
                )}

                <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-4">
                  Тариф {t.name}
                </div>

                <div className="flex items-baseline gap-2 mb-6">
                  <span className="font-mono text-6xl md:text-7xl text-bone">
                    ${t.price}
                  </span>
                </div>

                <p className="text-bone/65 mb-10 leading-relaxed text-lg">
                  {t.desc}
                </p>

                <ul className="space-y-3 mb-10 flex-1">
                  {t.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-3 text-bone/80"
                    >
                      <span
                        className={
                          'font-mono mt-1 text-xs ' +
                          (t.accent ? 'text-lime' : 'text-azure')
                        }
                      >
                        →
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#cta"
                  className={
                    'block text-center font-mono text-xs tracking-[0.2em] uppercase px-8 py-5 transition-colors ' +
                    (t.accent
                      ? 'bg-lime text-ink hover:bg-bone'
                      : 'border border-bone/30 text-bone hover:border-lime hover:text-lime')
                  }
                >
                  {t.cta}
                </a>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}
