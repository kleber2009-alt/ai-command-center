import { User, Briefcase, FileSignature, HeartHandshake } from "lucide-react";

const services = [
  {
    icon: User,
    title: "Физическим лицам",
    description:
      "Семейные и наследственные споры, защита прав потребителей, трудовые конфликты, ДТП. Сопровождаем от консультации до решения суда.",
  },
  {
    icon: Briefcase,
    title: "Бизнесу",
    description:
      "Корпоративные споры, договорная работа, налоговые проверки, представительство в арбитраже. Снижаем риски на этапе сделки.",
  },
  {
    icon: FileSignature,
    title: "Сопровождение сделок",
    description:
      "Проверка контрагентов, due diligence, разработка и экспертиза договоров, M&A. Чтобы подпись стояла только под безопасным документом.",
  },
  {
    icon: HeartHandshake,
    title: "Пенсионерам",
    description:
      "Перерасчёт пенсии, оформление льгот и субсидий, споры с СФР, жилищные и наследственные вопросы. Помогаем разобраться без хождения по инстанциям.",
  },
];

export default function Services() {
  return (
    <section id="services" className="py-16 sm:py-24 border-t border-white/10">
      <h2 className="font-serif text-3xl sm:text-4xl text-white">Услуги</h2>
      <p className="mt-3 text-white/60">
        Скоро дополним направления. Сейчас работаем по этим ключевым блокам.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {services.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-lg border border-white/10 bg-ink-900/60 p-6 hover:border-accent/50 transition-colors"
          >
            <Icon className="w-7 h-7 text-accent" />
            <h3 className="mt-4 font-serif text-xl text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
