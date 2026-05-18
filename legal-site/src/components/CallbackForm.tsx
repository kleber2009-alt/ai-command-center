"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, PhoneCall } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

export default function CallbackForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value.trim(),
      phone: (form.elements.namedItem("phone") as HTMLInputElement).value.trim(),
    };

    if (!data.name || data.phone.replace(/\D/g, "").length < 10) {
      setStatus("error");
      setErrorMsg("Заполните имя и телефон");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Не удалось отправить заявку");
      }
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Что-то пошло не так");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/5 p-6 flex items-start gap-3 max-w-xl">
        <CheckCircle2 className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-white font-medium">Заявка принята</p>
          <p className="mt-1 text-sm text-white/65">
            Юрист перезвонит вам в течение 15 минут в рабочее время.
            Если вопрос срочный — напишите в Telegram или WhatsApp ниже.
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-4 text-sm text-accent hover:underline"
          >
            Отправить ещё одну заявку
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm text-white/70 mb-1.5">
            Как вас зовут
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="w-full rounded-md border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent transition-colors"
            placeholder="Иван"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm text-white/70 mb-1.5">
            Телефон
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            className="w-full rounded-md border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent transition-colors"
            placeholder="+7 999 000-00-00"
          />
        </div>
      </div>

      {status === "error" && (
        <div className="flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-accent text-ink-950 font-medium hover:bg-accent-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PhoneCall className="w-4 h-4" />
          )}
          {status === "loading" ? "Отправляем…" : "Жду звонка"}
        </button>
        <p className="text-xs text-white/40">
          Нажимая кнопку, вы соглашаетесь
          <br className="hidden sm:inline" /> на обработку персональных данных.
        </p>
      </div>
    </form>
  );
}
