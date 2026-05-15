'use client'

export function Footer() {
  return (
    <footer className="bg-ink">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-[2px]">
          <div className="md:col-span-2 pr-6">
            <div className="font-mono text-sm tracking-[0.2em] text-bone mb-6">
              AI OFFICE
            </div>
            <p className="text-bone/55 leading-relaxed max-w-md">
              AI-офис под ключ для онлайн-школ и инфобизнеса. Внедряем,
              обучаем, сопровождаем.
            </p>
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-bone/40 mb-5">
              Навигация
            </div>
            <ul className="space-y-3 text-bone/75">
              <li><a href="#how" className="hover:text-lime transition-colors">Как это работает</a></li>
              <li><a href="#included" className="hover:text-lime transition-colors">Что входит</a></li>
              <li><a href="#pricing" className="hover:text-lime transition-colors">Цены</a></li>
              <li><a href="#faq" className="hover:text-lime transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-bone/40 mb-5">
              Контакты
            </div>
            <ul className="space-y-3 text-bone/75">
              <li><a href="mailto:hello@ai-office.io" className="hover:text-lime transition-colors">hello@ai-office.io</a></li>
              <li><a href="https://t.me/ai_office" className="hover:text-lime transition-colors">Telegram</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-bone/10 flex flex-col md:flex-row gap-4 justify-between font-mono text-[10px] tracking-[0.2em] uppercase text-bone/40">
          <div>© 2026 AI OFFICE. Все права защищены.</div>
          <div>Сделано вручную. Запущено на автопилоте.</div>
        </div>
      </div>
    </footer>
  )
}
