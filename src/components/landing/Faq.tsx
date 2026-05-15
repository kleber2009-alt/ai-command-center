'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FadeUp } from './FadeUp'

const ITEMS = [
  {
    q: 'Что если я не разбираюсь в AI?',
    a: 'Это нормально. В этом и смысл услуги: вы платите за то, чтобы не разбираться. Мы настраиваем, обучаем команду, оставляем понятные инструкции. От вас — доступ к аккаунтам и час на бриф.',
  },
  {
    q: 'Сколько на самом деле длится внедрение?',
    a: 'Тариф Pro — 30 календарных дней от старта до передачи. Start — до 14 дней. Если у вас сложная CRM или нестандартные интеграции, на этапе аудита мы это обсудим и пропишем в договоре.',
  },
  {
    q: 'Подойдёт ли это моей школе?',
    a: 'Если вы продаёте онлайн-обучение, у вас есть база клиентов и хотя бы один менеджер — да. Мы работали со школами от 500 до 50 000 учеников. На аудите честно скажем, есть ли смысл.',
  },
  {
    q: 'А если я хочу заменить всю команду на AI?',
    a: 'Не сработает и не нужно. AI заменяет рутину, а не людей. Лучший результат — когда AI снимает 60–80% задач, а команда фокусируется на стратегии, продукте и клиентах высокого чека.',
  },
  {
    q: 'Что включает поддержка после запуска?',
    a: 'В тарифе Pro — 30 дней: правки промптов, донастройка воронок, обучение новых сотрудников, реакция на инциденты в течение 4 часов. Дальше — по запросу или абонентка.',
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="border-b border-bone/10">
      <div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
        <FadeUp>
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-6">
            [ 06 — FAQ ]
          </div>
          <h2 className="font-serif text-4xl md:text-6xl leading-[1] tracking-tight mb-16">
            Частые <span className="italic text-lime">вопросы</span>.
          </h2>
        </FadeUp>

        <div className="border-t border-bone/15">
          {ITEMS.map((it, i) => {
            const isOpen = open === i
            return (
              <FadeUp key={it.q} delay={i * 0.05}>
                <div className="border-b border-bone/15">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="w-full flex items-start justify-between gap-8 py-7 text-left group"
                  >
                    <div className="flex items-start gap-6 flex-1">
                      <span className="font-mono text-[11px] tracking-[0.2em] text-bone/40 mt-2">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="font-serif text-2xl md:text-3xl leading-snug group-hover:text-lime transition-colors">
                        {it.q}
                      </span>
                    </div>
                    <span
                      className={
                        'font-mono text-2xl text-bone/70 transition-transform shrink-0 mt-1 ' +
                        (isOpen ? 'rotate-45' : '')
                      }
                    >
                      +
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <p className="pb-7 pl-14 pr-10 text-bone/70 leading-relaxed text-lg max-w-3xl">
                          {it.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeUp>
            )
          })}
        </div>
      </div>
    </section>
  )
}
