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
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-screen bg-apple-bg text-apple-ink antialiased">
        <TelegramInit />
        {children}
      </body>
    </html>
  )
}
