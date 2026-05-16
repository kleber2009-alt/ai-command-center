import Hero from "@/components/Hero";
import Services from "@/components/Services";
import Contacts from "@/components/Contacts";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-8">
      <Hero />
      <Services />
      <Contacts />
      <Footer />
    </main>
  );
}
