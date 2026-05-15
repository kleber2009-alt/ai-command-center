export default function About() {
  return (
    <section id="about" className="border-b border-ink-200/60 bg-white">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 sm:py-32 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-gold-600">
            <span className="h-px w-10 bg-gold-500" />
            О фирме
          </div>
          <h2 className="font-serif text-4xl font-medium leading-tight text-ink-900 sm:text-5xl">
            Принципы, на которых
            <br />
            строится практика
          </h2>
        </div>

        <div className="space-y-10 text-lg leading-relaxed text-ink-900/75">
          <p>
            Мы работаем там, где цена ошибки высока: корпоративные конфликты,
            налоговые проверки, защита активов, репутационные риски. Берёмся не за
            каждое дело — а только за то, где видим путь к результату.
          </p>

          <div className="grid grid-cols-3 gap-8 border-t border-ink-200 pt-10">
            <Stat value="14" label="лет практики" />
            <Stat value="2 000+" label="закрытых дел" />
            <Stat value="92%" label="выигранных споров" />
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-4xl font-medium text-ink-900">{value}</div>
      <div className="mt-2 text-sm text-ink-900/55">{label}</div>
    </div>
  )
}
