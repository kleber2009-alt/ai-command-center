'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, Plus, Minus } from 'lucide-react'

const BG = '#080808'
const FG = '#f5f0e8'
const LIME = '#c8f060'
const BLUE = '#60c8f0'
const PINK = '#f06090'
const CARD = '#0c0c0c'
const ALT = '#0a0a0a'
const LINE = '#1a1a1a'

const SERIF = 'Georgia, "Times New Roman", serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'

const outline = (color = FG): React.CSSProperties => ({
  color: 'transparent',
  WebkitTextStroke: `1px ${color}`,
})

function useInView() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setInView(true)
      return
    }
    const node = ref.current
    if (!node) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          obs.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [])
  return { ref, inView }
}

function FadeUp({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const { ref, inView } = useInView()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity .7s ease-out, transform .7s ease-out',
        transitionDelay: `${delay}s`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}

function Label({ children, color = LIME }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color,
      }}
    >
      {children}
    </span>
  )
}

function Logo({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span style={{ fontFamily: MONO, color: LIME, fontSize: size - 4 }}>◆</span>
      <span style={{ fontFamily: SERIF, fontSize: size, letterSpacing: '0.06em' }}>AI ОФИС</span>
    </span>
  )
}

// ─────────────────────────────────────────────  NAV
function Nav() {
  return (
    <nav
      className="fixed top-0 inset-x-0 z-50 backdrop-blur"
      style={{ background: 'rgba(8,8,8,0.78)', borderBottom: `1px solid ${LINE}` }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-[68px] flex items-center justify-between">
        <a href="#top">
          <Logo />
        </a>
        <div
          className="hidden md:flex items-center gap-9"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          <a href="#how" className="transition-colors hover:text-[#c8f060]">
            Как это работает
          </a>
          <a href="#what" className="transition-colors hover:text-[#c8f060]">
            Что входит
          </a>
          <a href="#pricing" className="transition-colors hover:text-[#c8f060]">
            Тарифы
          </a>
          <a href="#faq" className="transition-colors hover:text-[#c8f060]">
            FAQ
          </a>
        </div>
        <a
          href="#cta"
          className="hidden md:inline-flex items-center gap-2 px-4 py-2.5"
          style={{
            border: `1px solid ${LIME}`,
            color: LIME,
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          Получить
          <ArrowRight size={14} />
        </a>
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────  HERO
function Hero() {
  const stats: [string, string][] = [
    ['+47%', 'к выручке'],
    ['24/7', 'без выгорания'],
    ['30 дней', 'до запуска'],
    ['12+', 'онлайн-школ'],
  ]
  return (
    <section id="top" className="relative px-6 md:px-10 pt-36 md:pt-48 pb-24 md:pb-32 overflow-hidden">
      <div
        className="absolute pointer-events-none select-none"
        style={{
          ...outline(FG),
          fontFamily: SERIF,
          fontWeight: 700,
          fontSize: 'clamp(220px, 32vw, 480px)',
          lineHeight: 0.85,
          top: -40,
          right: -40,
          opacity: 0.35,
        }}
      >
        01
      </div>
      <div className="relative max-w-7xl mx-auto">
        <FadeUp>
          <Label>AI ОФИС / готовая ИИ-команда</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h1
            className="mt-8 max-w-5xl"
            style={{
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: 'clamp(40px, 7.4vw, 104px)',
              lineHeight: 1.02,
              letterSpacing: '-0.01em',
            }}
          >
            Твой бизнес работает на&nbsp;ИИ.
            <br />
            <span style={{ color: LIME }}>Пока ты&nbsp;спишь.</span>
          </h1>
        </FadeUp>
        <FadeUp delay={0.16}>
          <p
            className="mt-8 max-w-2xl"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(16px, 1.4vw, 20px)',
              lineHeight: 1.6,
              opacity: 0.78,
            }}
          >
            Готовый ИИ-офис под ключ для онлайн-школ и инфобизнеса. Контент, продажи, аналитика и
            поддержка — всё работает автоматически 24/7. За тебя.
          </p>
        </FadeUp>
        <FadeUp delay={0.24}>
          <div className="mt-12 flex flex-col sm:flex-row gap-[2px]">
            <a
              href="#pricing"
              className="inline-flex items-center justify-center gap-3 px-8 py-5 transition-transform hover:-translate-y-[1px]"
              style={{
                background: LIME,
                color: BG,
                fontFamily: MONO,
                fontSize: 12,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}
            >
              Запустить за 30 дней
              <ArrowUpRight size={18} />
            </a>
            <a
              href="#how"
              className="inline-flex items-center justify-center gap-3 px-8 py-5 transition-colors hover:bg-[#0c0c0c]"
              style={{
                border: `1px solid ${FG}`,
                color: FG,
                fontFamily: MONO,
                fontSize: 12,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}
            >
              Как это работает
            </a>
          </div>
        </FadeUp>
        <FadeUp delay={0.32}>
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-[2px]">
            {stats.map(([val, lbl], i) => (
              <div
                key={i}
                className="p-6 md:p-7"
                style={{ background: CARD, borderTop: `1px solid ${LINE}` }}
              >
                <div style={{ fontFamily: MONO, fontSize: 32, color: LIME, lineHeight: 1 }}>
                  {val}
                </div>
                <div
                  className="mt-3"
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    opacity: 0.55,
                  }}
                >
                  {lbl}
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  PAIN
const PAINS = [
  {
    num: '01',
    title: 'Команда стоит дорого. Очень.',
    body: 'Контент-менеджер, копирайтер, таргетолог, аналитик, поддержка — каждый по $1500+. Минимум $6000/мес только на ФОТ.',
    color: PINK,
  },
  {
    num: '02',
    title: 'Делаешь всё сам — выгораешь.',
    body: 'Пишешь посты в два ночи, отвечаешь клиентам по выходным, считаешь юнит-экономику в Excel. Бизнес держится на тебе одном.',
    color: BLUE,
  },
  {
    num: '03',
    title: 'Рост уперся в потолок.',
    body: 'Хочешь масштабировать продукт, но не успеваешь физически. Каждый новый ученик добавляет 2 часа работы в неделю.',
    color: LIME,
  },
]

function Pain() {
  return (
    <section className="px-6 md:px-10 py-24 md:py-32">
      <div className="max-w-7xl mx-auto">
        <FadeUp>
          <Label color={PINK}>Знакомо?</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h2
            className="mt-6 max-w-4xl"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(32px, 5vw, 60px)',
              lineHeight: 1.08,
              letterSpacing: '-0.005em',
            }}
          >
            Онлайн-школа — это не свобода.
            <br />
            <span style={{ opacity: 0.45 }}>Это вторая работа в полночь.</span>
          </h2>
        </FadeUp>
        <div className="mt-16 grid md:grid-cols-3 gap-[2px]">
          {PAINS.map((p, i) => (
            <FadeUp key={p.num} delay={0.1 * i} className="h-full">
              <div
                className="relative p-8 md:p-10 h-full flex flex-col"
                style={{ background: CARD }}
              >
                <div
                  style={{
                    ...outline(FG),
                    fontFamily: SERIF,
                    fontWeight: 700,
                    fontSize: 96,
                    lineHeight: 1,
                    opacity: 0.5,
                  }}
                >
                  {p.num}
                </div>
                <h3
                  className="mt-8"
                  style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.2 }}
                >
                  {p.title}
                </h3>
                <p
                  className="mt-4 flex-1"
                  style={{
                    fontFamily: SERIF,
                    fontSize: 15,
                    lineHeight: 1.6,
                    opacity: 0.7,
                  }}
                >
                  {p.body}
                </p>
                <div
                  className="mt-8"
                  style={{ width: 48, height: 1, background: p.color }}
                />
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  SOLUTION
const SOLUTIONS = [
  {
    num: '01',
    title: 'AI-команда под твою нишу',
    body: '6 ИИ-агентов: контент, продажи, аналитика, поддержка, маркетинг, финансы. Каждый знает твой продукт, тон и метрики.',
  },
  {
    num: '02',
    title: 'Автопилот для рутины',
    body: 'Посты, рассылки, ответы клиентам, отчёты — генерируются и публикуются без твоего участия. Ты только согласуешь.',
  },
  {
    num: '03',
    title: 'Аналитика, которая показывает деньги',
    body: 'Дашборд считает MRR, LTV, конверсию и подсказывает где теряются деньги. Каждое утро — короткий брифинг.',
  },
  {
    num: '04',
    title: 'Сопровождение и обновления',
    body: '30 дней онбординга, доступ к закрытому Slack, разборы кейсов, новые модели и интеграции. Не «продали и забыли».',
  },
]

function Solution() {
  return (
    <section id="what" className="px-6 md:px-10 py-24 md:py-32">
      <div className="max-w-7xl mx-auto">
        <FadeUp>
          <Label>Что входит</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h2
            className="mt-6 max-w-4xl"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(32px, 5vw, 60px)',
              lineHeight: 1.08,
              letterSpacing: '-0.005em',
            }}
          >
            Что ты получаешь
            <br />
            <span style={{ color: LIME }}>за 30 дней</span>
          </h2>
        </FadeUp>
        <div className="mt-16 grid md:grid-cols-2 gap-[2px]">
          {SOLUTIONS.map((s, i) => (
            <FadeUp key={s.num} delay={0.08 * i} className="h-full">
              <div
                className="relative p-8 md:p-12 h-full"
                style={{ background: CARD }}
              >
                <div className="flex items-start justify-between gap-6">
                  <div
                    style={{
                      ...outline(FG),
                      fontFamily: SERIF,
                      fontWeight: 700,
                      fontSize: 'clamp(80px, 9vw, 140px)',
                      lineHeight: 0.85,
                    }}
                  >
                    {s.num}
                  </div>
                  <div className="pt-2 shrink-0" style={{ color: LIME }}>
                    <Check size={28} strokeWidth={1.5} />
                  </div>
                </div>
                <h3
                  className="mt-8"
                  style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.2 }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-4"
                  style={{
                    fontFamily: SERIF,
                    fontSize: 16,
                    lineHeight: 1.6,
                    opacity: 0.72,
                  }}
                >
                  {s.body}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  HOW IT WORKS
const STEPS = [
  {
    num: '01',
    title: 'Аудит',
    duration: 'Неделя 1',
    body: 'Глубокий созвон: продукт, аудитория, контент-стратегия, ключевые метрики. Карта процессов, которые автоматизируем.',
  },
  {
    num: '02',
    title: 'Настройка',
    duration: 'Недели 2–3',
    body: 'Подключаем агентов и интеграции (Telegram, Notion, Stripe, GetCourse), тренируем под твой тон и продукт.',
  },
  {
    num: '03',
    title: 'Запуск',
    duration: 'Неделя 4',
    body: 'Запускаем по этапам, проверяем результат, обучаем команду. К 30-му дню — полный автопилот.',
  },
]

function HowItWorks() {
  return (
    <section id="how" className="px-6 md:px-10 py-24 md:py-32" style={{ background: ALT }}>
      <div className="max-w-7xl mx-auto">
        <FadeUp>
          <Label color={BLUE}>Как это работает</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h2
            className="mt-6 max-w-3xl"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(32px, 5vw, 60px)',
              lineHeight: 1.08,
              letterSpacing: '-0.005em',
            }}
          >
            Три шага<br />до автопилота
          </h2>
        </FadeUp>
        <div className="mt-20 relative">
          <div
            className="hidden md:block absolute left-0 right-0"
            style={{
              top: 48,
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${BLUE} 50%, transparent 100%)`,
              opacity: 0.4,
            }}
          />
          <div className="grid md:grid-cols-3 gap-12 md:gap-8 relative">
            {STEPS.map((step, i) => (
              <FadeUp key={step.num} delay={0.12 * i}>
                <div className="flex flex-col items-start">
                  <div
                    className="w-24 h-24 flex items-center justify-center"
                    style={{ background: BG, border: `1px solid ${BLUE}` }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 24, color: BLUE }}>
                      {step.num}
                    </span>
                  </div>
                  <div
                    className="mt-7"
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: BLUE,
                      opacity: 0.75,
                    }}
                  >
                    {step.duration}
                  </div>
                  <h3
                    className="mt-3"
                    style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 1.1 }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="mt-4"
                    style={{
                      fontFamily: SERIF,
                      fontSize: 16,
                      lineHeight: 1.6,
                      opacity: 0.72,
                    }}
                  >
                    {step.body}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  PRICING
const PLANS = [
  {
    name: 'Start',
    price: '990',
    tag: 'Для соло-экспертов',
    features: [
      '3 ИИ-агента: контент + поддержка + аналитика',
      'Интеграция с 1 платформой',
      '14 дней онбординга',
      'Telegram-поддержка',
      'Базовый дашборд',
    ],
    cta: 'Начать со Start',
    accent: BLUE,
    featured: false,
  },
  {
    name: 'Pro',
    price: '2 490',
    tag: 'Для растущих школ',
    features: [
      'Все 6 ИИ-агентов',
      'Интеграции с 5 платформами',
      '30 дней сопровождения',
      'Slack + созвоны 1:1',
      'Расширенный дашборд + AI-брифинг',
      'Кастомные сценарии автоматизации',
    ],
    cta: 'Получить Pro',
    accent: LIME,
    featured: true,
  },
]

function Pricing() {
  return (
    <section id="pricing" className="px-6 md:px-10 py-24 md:py-32">
      <div className="max-w-7xl mx-auto">
        <FadeUp>
          <Label>Тарифы</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h2
            className="mt-6 max-w-3xl"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(32px, 5vw, 60px)',
              lineHeight: 1.08,
              letterSpacing: '-0.005em',
            }}
          >
            Один платёж.
            <br />
            <span style={{ opacity: 0.45 }}>Без подписок и сюрпризов.</span>
          </h2>
        </FadeUp>
        <div className="mt-16 grid md:grid-cols-2 gap-[2px]">
          {PLANS.map((plan, i) => (
            <FadeUp key={plan.name} delay={0.1 * i} className="h-full">
              <div
                className="relative p-10 md:p-12 h-full"
                style={{
                  background: CARD,
                  outline: plan.featured ? `2px solid ${LIME}` : 'none',
                  outlineOffset: '-2px',
                }}
              >
                {plan.featured && (
                  <div
                    className="absolute top-0 right-0 px-4 py-2"
                    style={{
                      background: LIME,
                      color: BG,
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Рекомендуем
                  </div>
                )}
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: plan.accent,
                    opacity: 0.8,
                  }}
                >
                  {plan.tag}
                </div>
                <div
                  className="mt-4"
                  style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1 }}
                >
                  {plan.name}
                </div>
                <div className="mt-10 flex items-baseline gap-2 flex-wrap">
                  <span style={{ fontFamily: MONO, fontSize: 20, opacity: 0.6 }}>$</span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 'clamp(56px, 7vw, 80px)',
                      lineHeight: 1,
                      color: plan.featured ? LIME : FG,
                    }}
                  >
                    {plan.price}
                  </span>
                  <span
                    className="ml-2"
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      opacity: 0.55,
                    }}
                  >
                    один раз
                  </span>
                </div>
                <div className="mt-10" style={{ height: 1, background: LINE }} />
                <ul className="mt-10 space-y-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-4">
                      <Check
                        size={18}
                        strokeWidth={1.5}
                        style={{ color: plan.accent, marginTop: 4, flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontFamily: SERIF,
                          fontSize: 15,
                          lineHeight: 1.5,
                          opacity: 0.88,
                        }}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#cta"
                  className="mt-12 inline-flex w-full items-center justify-center gap-3 px-6 py-5 transition-transform hover:-translate-y-[1px]"
                  style={{
                    background: plan.featured ? LIME : 'transparent',
                    border: plan.featured ? `1px solid ${LIME}` : `1px solid ${FG}`,
                    color: plan.featured ? BG : FG,
                    fontFamily: MONO,
                    fontSize: 12,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                  }}
                >
                  {plan.cta}
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </FadeUp>
          ))}
        </div>
        <FadeUp delay={0.2}>
          <p
            className="mt-10 text-center"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: 0.5,
            }}
          >
            7 дней — гарантия возврата · Цены без НДС
          </p>
        </FadeUp>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  TESTIMONIALS
const TESTIMONIALS = [
  {
    quote:
      'За первый месяц освободил 30 часов в неделю. ИИ-агенты делают то, на что я раньше нанимал четырёх человек.',
    name: 'Иван Соколов',
    role: 'Школа фронтенда «Practica»',
  },
  {
    quote:
      'Конверсия из лида в покупку выросла с 4% до 11%. Агент прогрева сегментирует и пишет каждому в его контексте.',
    name: 'Маргарита Линд',
    role: 'Marketing School',
  },
  {
    quote:
      'Уехала в Бали на месяц. Школа выросла на 22% за это время. До AI ОФИС я физически не могла отойти от ноутбука.',
    name: 'Аня Воронова',
    role: 'Курсы по UX-исследованиям',
  },
]

function Testimonials() {
  return (
    <section className="px-6 md:px-10 py-24 md:py-32" style={{ background: ALT }}>
      <div className="max-w-7xl mx-auto">
        <FadeUp>
          <Label color={PINK}>Кейсы</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h2
            className="mt-6 max-w-4xl"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(32px, 5vw, 60px)',
              lineHeight: 1.08,
              letterSpacing: '-0.005em',
            }}
          >
            12+ онлайн-школ
            <br />
            <span style={{ opacity: 0.45 }}>уже живут на автопилоте.</span>
          </h2>
        </FadeUp>
        <div className="mt-16 grid md:grid-cols-3 gap-[2px]">
          {TESTIMONIALS.map((t, i) => (
            <FadeUp key={t.name} delay={0.1 * i} className="h-full">
              <div
                className="p-8 md:p-10 h-full flex flex-col"
                style={{ background: BG }}
              >
                <div
                  style={{
                    color: 'transparent',
                    WebkitTextStroke: `1px ${PINK}`,
                    fontFamily: SERIF,
                    fontWeight: 700,
                    fontSize: 96,
                    lineHeight: 0.7,
                  }}
                >
                  &ldquo;
                </div>
                <p
                  className="mt-6 flex-1"
                  style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.5 }}
                >
                  {t.quote}
                </p>
                <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${LINE}` }}>
                  <div style={{ fontFamily: SERIF, fontSize: 16 }}>{t.name}</div>
                  <div
                    className="mt-1"
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      opacity: 0.55,
                    }}
                  >
                    {t.role}
                  </div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  FAQ
const FAQS = [
  {
    q: 'Сколько времени нужно от меня после запуска?',
    a: '15–30 минут в день: согласовать публикации, проверить дашборд, ответить на 2–3 эскалации от ИИ-поддержки. Всё остальное идёт автоматически.',
  },
  {
    q: 'Нужны ли мне технические навыки?',
    a: 'Нет. Мы настраиваем всё под ключ. От вас — только доступы к платформам (Telegram, GetCourse и т.п.) и понимание своего продукта.',
  },
  {
    q: 'Что если мне не подойдёт?',
    a: 'В течение первой недели — 100% возврат без вопросов. После — рассматриваем индивидуально, но за 12 школ возвратов не было.',
  },
  {
    q: 'Какие платформы поддерживаете?',
    a: 'Telegram, Notion, GetCourse, Tilda, Stripe, ЮKassa, Slack, Google Sheets, Mailchimp, Webflow. На тарифе Pro — любые с открытым API.',
  },
  {
    q: 'Будут ли обновления после 30 дней?',
    a: 'Да. Pro включает 6 месяцев обновлений (новые модели, агенты, интеграции). Дальше — опциональная подписка $99/мес.',
  },
]

function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="px-6 md:px-10 py-24 md:py-32">
      <div className="max-w-4xl mx-auto">
        <FadeUp>
          <Label>FAQ</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h2
            className="mt-6"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(32px, 5vw, 60px)',
              lineHeight: 1.08,
              letterSpacing: '-0.005em',
            }}
          >
            Часто спрашивают
          </h2>
        </FadeUp>
        <div className="mt-16 flex flex-col gap-[2px]">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <FadeUp key={f.q} delay={0.05 * i}>
                <div style={{ background: CARD }}>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="w-full px-6 md:px-10 py-6 md:py-8 flex items-center justify-between gap-6 text-left"
                    aria-expanded={isOpen}
                  >
                    <span
                      style={{
                        fontFamily: SERIF,
                        fontSize: 'clamp(17px, 1.5vw, 21px)',
                        lineHeight: 1.3,
                      }}
                    >
                      {f.q}
                    </span>
                    <span
                      style={{
                        color: isOpen ? LIME : FG,
                        flexShrink: 0,
                        transition: 'color .2s',
                      }}
                    >
                      {isOpen ? <Minus size={20} strokeWidth={1.5} /> : <Plus size={20} strokeWidth={1.5} />}
                    </span>
                  </button>
                  <div
                    style={{
                      maxHeight: isOpen ? 600 : 0,
                      overflow: 'hidden',
                      transition: 'max-height .4s ease',
                    }}
                  >
                    <p
                      className="px-6 md:px-10 pb-7 md:pb-8 max-w-[68ch]"
                      style={{
                        fontFamily: SERIF,
                        fontSize: 16,
                        lineHeight: 1.65,
                        opacity: 0.72,
                      }}
                    >
                      {f.a}
                    </p>
                  </div>
                </div>
              </FadeUp>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  FINAL CTA
function FinalCTA() {
  return (
    <section
      id="cta"
      className="relative px-6 md:px-10 py-32 md:py-48 overflow-hidden"
      style={{ background: CARD }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        style={{
          ...outline(FG),
          fontFamily: SERIF,
          fontWeight: 700,
          fontSize: 'clamp(220px, 36vw, 560px)',
          lineHeight: 0.85,
          opacity: 0.4,
        }}
      >
        AI
      </div>
      <div className="relative max-w-5xl mx-auto text-center">
        <FadeUp>
          <Label>Следующий шаг</Label>
        </FadeUp>
        <FadeUp delay={0.08}>
          <h2
            className="mt-8"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(40px, 8vw, 112px)',
              lineHeight: 1.0,
              letterSpacing: '-0.01em',
            }}
          >
            Перестань быть
            <br />
            <span style={{ color: LIME }}>узким горлышком</span>
            <br />
            собственного бизнеса.
          </h2>
        </FadeUp>
        <FadeUp delay={0.18}>
          <p
            className="mt-10 max-w-2xl mx-auto"
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(16px, 1.4vw, 20px)',
              lineHeight: 1.6,
              opacity: 0.75,
            }}
          >
            Запиши 30-минутный созвон. Покажем как ИИ-офис ляжет на твою школу и сколько часов вернётся.
          </p>
        </FadeUp>
        <FadeUp delay={0.28}>
          <a
            href="mailto:hi@ai-office.ru"
            className="mt-12 inline-flex items-center gap-4 px-10 py-6 transition-transform hover:-translate-y-[1px]"
            style={{
              background: LIME,
              color: BG,
              fontFamily: MONO,
              fontSize: 13,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            Записаться на созвон
            <ArrowUpRight size={20} />
          </a>
        </FadeUp>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────  FOOTER
function Footer() {
  return (
    <footer className="px-6 md:px-10 py-12" style={{ borderTop: `1px solid ${LINE}` }}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <Logo />
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-3"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: 0.65,
          }}
        >
          <a href="#how" className="transition-opacity hover:opacity-100">
            Как работает
          </a>
          <a href="#pricing" className="transition-opacity hover:opacity-100">
            Тарифы
          </a>
          <a href="#faq" className="transition-opacity hover:opacity-100">
            FAQ
          </a>
          <a href="mailto:hi@ai-office.ru" className="transition-opacity hover:opacity-100">
            hi@ai-office.ru
          </a>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: 0.4,
          }}
        >
          © 2026 AI ОФИС
        </div>
      </div>
    </footer>
  )
}

// ─────────────────────────────────────────────  PAGE
export default function LandingPage() {
  useEffect(() => {
    const html = document.documentElement
    const prevBg = document.body.style.background
    const prevScroll = html.style.scrollBehavior
    const prevPad = html.style.scrollPaddingTop
    document.body.style.background = BG
    html.style.scrollBehavior = 'smooth'
    html.style.scrollPaddingTop = '76px'
    return () => {
      document.body.style.background = prevBg
      html.style.scrollBehavior = prevScroll
      html.style.scrollPaddingTop = prevPad
    }
  }, [])

  return (
    <main
      style={{
        background: BG,
        color: FG,
        minHeight: '100vh',
        fontFamily: SERIF,
      }}
    >
      <Nav />
      <Hero />
      <Pain />
      <Solution />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  )
}
