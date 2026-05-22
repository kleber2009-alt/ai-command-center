import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Persona Train · клонирование голоса',
  description: 'Обучи AI-агента своим голосом. ElevenLabs IVC + Telegram-бот для непрерывного обучения на голосовых.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap"
        />
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23080808'/%3E%3Ctext y='22' x='4' font-size='20'%3E%F0%9F%8E%99%3C/text%3E%3C/svg%3E"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
