import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { getLocale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Persona Studio — Luxury AI Content Studio',
  description:
    'Личная AI-медиастудия: аватары, голос, видео, обложки, монтаж и trend intelligence в одном инструменте.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <head>
        {/* Editorial typography pair: Playfair Display (serif) + Inter (sans) + JetBrains Mono (status labels). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {/* Telegram WebApp SDK — loaded everywhere so Stars-pay & viewport helpers work after redirect from /tma */}
        <Script src="https://telegram.org/js/telegram-web-app.js?57" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
