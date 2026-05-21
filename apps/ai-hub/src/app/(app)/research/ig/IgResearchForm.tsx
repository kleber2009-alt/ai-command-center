"use client";

// Form: submits /api/tools/ig-research/run → redirects to /research/ig/<jobId>.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const COST = 50;

export function IgResearchForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = username.replace(/^@/, "").trim();
    if (!u) { setError("Введите Instagram username"); return; }
    setError(null);
    start(async () => {
      const r = await fetch("/api/tools/ig-research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { username: u } }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error === "insufficient_funds"
          ? `Недостаточно токенов (нужно ${data.required}).`
          : data.error === "rate_limit"
          ? data.message
          : data.error ?? `HTTP ${r.status}`);
        return;
      }
      router.push(`/research/ig/${data.job.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 glass p-5 flex flex-col gap-4">
      <label className="text-sm font-medium">
        Instagram username
      </label>
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex-1 flex items-center gap-2 input">
          <span className="text-muted">@</span>
          <input type="text" value={username}
                 onChange={(e) => { setUsername(e.target.value); setError(null); }}
                 placeholder="username" autoComplete="off"
                 className="flex-1 bg-transparent border-none outline-none" />
        </div>
        <button type="submit" disabled={pending || !username.trim()} className="btn gap-2 whitespace-nowrap">
          {pending ? (
            <>
              <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              <span>Запускаю…</span>
            </>
          ) : (
            <>
              <span className="text-accent-cyan">✦</span>
              <span className="font-mono text-xs opacity-80">{COST}</span>
              <span>Анализировать</span>
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-muted">
        Анализирую публичные посты — приватные аккаунты не поддерживаются. Заняло ~40-90 сек.
      </p>
      {error && <div className="text-red-300 text-sm">{error}</div>}
    </form>
  );
}
