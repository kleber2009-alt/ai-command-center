export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-ink-200/60">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(212,175,106,0.10),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(11,18,32,0.05),transparent_50%)]"
      />

      <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
        <div className="max-w-3xl animate-fade-up">
          <div className="mb-8 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-gold-600">
            <span className="h-px w-10 bg-gold-500" />
            Юридическая фирма
          </div>

          <h1 className="font-serif text-5xl font-medium leading-[1.05] tracking-tight text-ink-900 sm:text-6xl lg:text-7xl">
            Право, в котором
            <br />
            <span className="italic text-gold-600">видна сила</span>
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-900/70">
            Защищаем бизнес и частных лиц в сложных правовых ситуациях. Работаем со
            спорами, сделками и репутацией — без формальностей и шаблонных решений.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-sm bg-ink-900 px-8 py-4 text-sm font-medium text-ink-50 transition-colors hover:bg-ink-950"
            >
              Записаться на консультацию
            </a>
            <a
              href="#services"
              className="inline-flex items-center justify-center rounded-sm border border-ink-900/15 px-8 py-4 text-sm font-medium text-ink-900 transition-colors hover:border-ink-900/40"
            >
              Наши услуги
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
