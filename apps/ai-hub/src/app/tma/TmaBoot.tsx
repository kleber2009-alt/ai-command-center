"use client";

// Telegram Mini App boot screen.
// Flow:
//   1. Wait for window.Telegram.WebApp to be available
//   2. Call WebApp.ready() + expand()
//   3. Send initData to /api/auth/telegram for validation + session
//   4. On success → redirect to /play/nano-banana-2 (или start_param если есть)
//   5. On failure → show error UI with retry button

import { useEffect, useState } from "react";

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name: string } };
  version: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  close(): void;
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

const VALID_PLAY_DESTINATIONS = new Set([
  "nano-banana-2", "nano-banana", "nano-banana-edit",
  "text-to-image", "image-edit", "image-upscale", "image-upscale-pro",
  "background-remove", "face-swap",
  "image-to-video", "image-to-video-pro", "text-to-video", "text-to-video-pro",
  "video-upscale", "carousel",
]);

const VALID_TOP_LEVEL = new Set(["dashboard", "tools", "gallery", "history", "wallet"]);

export function TmaBoot() {
  const [stage, setStage] = useState<"loading" | "auth" | "redirect" | "error" | "no-tg">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    // Give the SDK a beat to attach.
    let cancelled = false;
    let attempts = 0;
    const tick = setInterval(() => {
      if (cancelled) return;
      attempts++;
      const tg = window.Telegram?.WebApp;
      if (tg) {
        clearInterval(tick);
        void boot(tg);
      } else if (attempts > 25) {                    // ~5 sec
        clearInterval(tick);
        setStage("no-tg");
      }
    }, 200);
    return () => { cancelled = true; clearInterval(tick); };
  }, []);

  async function boot(tg: TelegramWebApp) {
    try {
      tg.ready();
      tg.expand();

      if (!tg.initData) {
        setStage("no-tg");
        return;
      }

      setStage("auth");
      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
        credentials: "include",
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }

      setStage("redirect");
      tg.HapticFeedback?.notificationOccurred("success");

      // start_param управляет deep-link'ом:
      //   tool slug ("nano-banana-2") → /play/<slug>
      //   top-level (gallery, history, wallet, tools) → /<section>
      //   иначе → /dashboard (полный кабинет с навигацией)
      const startParam = tg.initDataUnsafe?.start_param;
      let target = "/dashboard";
      if (startParam) {
        if (VALID_PLAY_DESTINATIONS.has(startParam)) target = `/play/${startParam}`;
        else if (VALID_TOP_LEVEL.has(startParam))    target = `/${startParam}`;
      }

      window.location.replace(target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStage("error");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="text-5xl mb-6">🍌</div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">AI Creative Hub</h1>
      <p className="text-muted text-sm mb-8">Mini App для @aicex_one_bot</p>

      {stage === "loading" && (
        <Spinner label="Загружаю Telegram SDK…" />
      )}
      {stage === "auth" && (
        <Spinner label="Авторизуюсь через Telegram…" />
      )}
      {stage === "redirect" && (
        <Spinner label="Открываю playground…" />
      )}
      {stage === "no-tg" && (
        <div className="space-y-3 max-w-xs">
          <p className="text-sm">Эта страница работает только внутри <b>Telegram</b> через @aicex_one_bot.</p>
          <p className="text-xs text-muted">Открой бот в Telegram и нажми «Открыть приложение» в меню.</p>
          <a href="https://t.me/aicex_one_bot" target="_blank" rel="noopener"
             className="btn inline-block mt-2">Открыть @aicex_one_bot</a>
        </div>
      )}
      {stage === "error" && (
        <div className="space-y-3 max-w-xs">
          <p className="text-red-400 text-sm">Ошибка авторизации</p>
          <p className="text-xs text-muted font-mono">{errorMsg}</p>
          <button onClick={() => window.location.reload()} className="btn-ghost mt-2">Повторить</button>
        </div>
      )}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
