import { Scale } from "lucide-react";

export default function Hero() {
  return (
    <section className="pt-12 sm:pt-20 pb-10 sm:pb-16">
      <div className="flex items-center gap-2 text-accent text-sm font-medium tracking-widest uppercase">
        <Scale className="w-4 h-4" />
        Юридическая компания
      </div>
      <h1 className="mt-5 font-serif text-4xl sm:text-6xl leading-[1.05] tracking-tight text-white">
        Защищаем интересы там,
        <br />
        где это важнее всего.
      </h1>
      <p className="mt-6 max-w-2xl text-base sm:text-lg text-white/70 leading-relaxed">
        Помогаем физическим лицам и бизнесу решать правовые вопросы
        без лишней бюрократии. Первая консультация — бесплатно.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="#contacts"
          className="inline-flex items-center px-6 py-3 rounded-md bg-accent text-ink-950 font-medium hover:bg-accent-dark transition-colors"
        >
          Связаться
        </a>
        <a
          href="#services"
          className="inline-flex items-center px-6 py-3 rounded-md border border-white/15 text-white/80 hover:bg-white/5 transition-colors"
        >
          Услуги
        </a>
      </div>
    </section>
  );
}
