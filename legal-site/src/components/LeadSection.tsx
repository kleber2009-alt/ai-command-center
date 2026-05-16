import LeadForm from "./LeadForm";
import Contacts from "./Contacts";

export default function LeadSection() {
  return (
    <section id="lead" className="py-16 sm:py-24 border-t border-white/10">
      <h2 className="font-serif text-3xl sm:text-4xl text-white">Оставить заявку</h2>
      <p className="mt-3 text-white/60 max-w-xl">
        Опишите вкратце ситуацию — юрист свяжется с вами в течение часа в рабочее время.
      </p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <LeadForm />
        <Contacts />
      </div>
    </section>
  );
}
