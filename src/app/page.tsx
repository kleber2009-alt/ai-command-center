import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { Pain } from '@/components/landing/Pain'
import { Solution } from '@/components/landing/Solution'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Pricing } from '@/components/landing/Pricing'
import { Testimonials } from '@/components/landing/Testimonials'
import { Faq } from '@/components/landing/Faq'
import { FinalCta } from '@/components/landing/FinalCta'
import { Footer } from '@/components/landing/Footer'

export default function Home() {
  return (
    <main className="min-h-screen bg-ink text-bone">
      <Nav />
      <Hero />
      <Pain />
      <Solution />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  )
}
