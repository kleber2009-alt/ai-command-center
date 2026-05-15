import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI ОФИС — Готовый ИИ-офис под ключ для онлайн-школ',
  description:
    'Контент, продажи, аналитика, поддержка — всё работает автоматически 24/7. Запуск за 30 дней.',
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
