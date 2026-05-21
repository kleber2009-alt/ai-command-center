import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Persona Studio — AI-контент из твоего лица',
  description:
    'Одно фото — 10 AI-аватаров, HeyGen-видео и виральные обложки карусели за 2 минуты.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
