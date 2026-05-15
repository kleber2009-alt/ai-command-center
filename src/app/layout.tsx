import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI OFFICE — AI-офис под ключ для онлайн-школ',
  description: 'Готовый AI-офис за 30 дней. Контент, поддержка, продажи и аналитика на автопилоте — пока вы спите.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-ink text-bone antialiased font-serif">
        {children}
      </body>
    </html>
  )
}
