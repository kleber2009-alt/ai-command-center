export default function Services() {
  return (
    <section id="services" className="border-b border-ink-200/60 bg-ink-50">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="max-w-2xl">
          <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-gold-600">
            <span className="h-px w-10 bg-gold-500" />
            Направления
          </div>
          <h2 className="font-serif text-4xl font-medium leading-tight text-ink-900 sm:text-5xl">
            Услуги
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-900/70">
            Раздел в работе. Опишите, какие направления нужно включить — и мы оформим
            их карточками с описанием, ценами и кейсами.
          </p>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-sm border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="group flex min-h-[180px] flex-col justify-between bg-ink-50 p-8 transition-colors hover:bg-white"
            >
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink-900/40">
                Услуга {String(i).padStart(2, '0')}
              </div>
              <div className="font-serif text-2xl font-medium text-ink-900/30 transition-colors group-hover:text-ink-900/60">
                Готово к наполнению
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
