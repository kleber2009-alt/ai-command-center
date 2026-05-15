import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Юридическая фирма — защита бизнеса и частных лиц',
  description:
    'Полный цикл юридического сопровождения: корпоративное право, налоги, судебные споры, защита бизнеса.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-ink-50 text-ink-900 antialiased">{children}</body>
    </html>
  )
}
