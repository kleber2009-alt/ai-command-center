import Script from 'next/script';
import { TmaBootstrap } from './bootstrap';

export const metadata = {
  title: 'Persona Studio · Telegram',
  // Tell Telegram clients we're a Mini App
  other: { 'telegram-bot-mini-app': 'true' },
};
export const dynamic = 'force-dynamic';

export default function TmaPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js?57" strategy="beforeInteractive" />
      <main className="min-h-screen flex items-center justify-center px-6">
        <TmaBootstrap />
      </main>
    </>
  );
}
