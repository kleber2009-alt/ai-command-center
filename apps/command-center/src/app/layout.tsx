import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Command Center · Project Hub',
  description: 'Каталог всех моих проектов с описанием, ссылками и редактируемым roadmap',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-950 text-slate-50 antialiased">
        {children}
      </body>
    </html>
  )
}
