import CallbackForm from "./CallbackForm";

export default function CallbackSection() {
  return (
    <section id="callback" className="py-16 sm:py-24 border-t border-white/10">
      <h2 className="font-serif text-3xl sm:text-4xl text-white">
        Закажите обратный звонок
      </h2>
      <p className="mt-3 text-white/60 max-w-xl">
        Оставьте номер — юрист перезвонит в течение 15 минут в рабочее время.
        Первая консультация бесплатно.
      </p>
      <div className="mt-8">
        <CallbackForm />
      </div>
    </section>
  );
}
