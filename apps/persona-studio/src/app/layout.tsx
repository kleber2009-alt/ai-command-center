import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Persona Studio — AI-контент из твоего лица',
  description:
    'Одно фото — 10 AI-аватаров, HeyGen-видео и виральные обложки карусели за 2 минуты.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* Telegram WebApp SDK — loaded everywhere so Stars-pay & viewport helpers work after redirect from /tma */}
        <Script src="https://telegram.org/js/telegram-web-app.js?57" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
