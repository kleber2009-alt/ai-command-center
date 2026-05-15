import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import TelegramInit from '@/components/TelegramInit'
import './globals.css'

export const metadata: Metadata = {
  title: 'Транскрипция',
  description: 'Транскрибация YouTube, Instagram Reels и аудиофайлов с AI-саммари, переводом и генерацией контента',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f172a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-slate-950 text-slate-50 antialiased min-h-screen">
        <TelegramInit />
        {children}
      </body>
    </html>
  )
}
