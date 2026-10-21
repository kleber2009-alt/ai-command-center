import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import localFont from 'next/font/local';
import './globals.css';
import { getLocale } from '@/lib/i18n-server';

// UI-моушн type: Onest (headlines 600, body 400, numbers 800) + JetBrains Mono
// for code. Self-hosted from public/fonts — no Google Fonts request.
const ui = localFont({
  src: [
    { path: '../../public/fonts/Onest-400.ttf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/Onest-600.ttf', weight: '500', style: 'normal' },
    { path: '../../public/fonts/Onest-600.ttf', weight: '600', style: 'normal' },
    { path: '../../public/fonts/Onest-800.ttf', weight: '700', style: 'normal' },
    { path: '../../public/fonts/Onest-800.ttf', weight: '800', style: 'normal' },
  ],
  variable: '--font-ui',
  display: 'swap',
});

const code = localFont({
  src: [
    { path: '../../public/fonts/JetBrainsMono-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/JetBrainsMono-800.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-code',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Persona Studio — AI-студия контента',
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
    <html lang={locale} className={`${ui.variable} ${code.variable}`}>
      <head>
        {/* Telegram WebApp SDK — loaded everywhere so Stars-pay & viewport helpers work after redirect from /tma */}
        <Script src="https://telegram.org/js/telegram-web-app.js?57" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
