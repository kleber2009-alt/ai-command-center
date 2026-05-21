import Script from "next/script";
import { TmaBoot } from "./TmaBoot";

export const dynamic = "force-dynamic";

export default function TmaEntryPage() {
  return (
    <main className="min-h-screen bg-bg text-text">
      {/* Telegram WebApp SDK — даёт нам window.Telegram.WebApp.initData
          + theme variables + viewport API. */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TmaBoot />
    </main>
  );
}
