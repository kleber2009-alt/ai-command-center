'use client'

import { motion } from 'framer-motion'

export function Hero() {
  return (
    <section id="top" className="relative border-b border-bone/10">
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-32 md:pt-32 md:pb-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="font-mono text-[11px] tracking-[0.25em] uppercase text-bone/50 mb-8"
        >
          [ AI-офис под ключ — для онлайн-школ и инфобизнеса ]
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
          className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight max-w-5xl"
        >
          Ваш бизнес работает на&nbsp;AI.{' '}
          <span className="italic text-lime">Пока вы спите.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.3 }}
          className="mt-10 max-w-2xl text-lg md:text-xl text-bone/70 leading-relaxed"
        >
          Полностью настроим AI-офис для вашей онлайн-школы за 30 дней.
          Контент, поддержка, продажи и аналитика — на автопилоте. Без найма,
          без курсов, без боли.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.45 }}
          className="mt-12 flex flex-col sm:flex-row gap-[2px]"
        >
          <a
            href="#pricing"
            className="bg-lime text-ink px-8 py-5 font-mono text-xs tracking-[0.2em] uppercase hover:bg-bone transition-colors text-center"
          >
            Получить AI-офис →
          </a>
          <a
            href="#included"
            className="border border-bone/30 text-bone px-8 py-5 font-mono text-xs tracking-[0.2em] uppercase hover:border-lime hover:text-lime transition-colors text-center"
          >
            Что входит
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-[2px] border-t border-bone/10 pt-10"
        >
          {[
            ['30', 'дней до запуска'],
            ['7', 'AI-инструментов'],
            ['24/7', 'работа без отдыха'],
            ['0', 'найма сотрудников'],
          ].map(([n, l]) => (
            <div key={l} className="px-2">
              <div className="font-mono text-3xl md:text-4xl text-bone">
                {n}
              </div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-bone/50 mt-2">
                {l}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
