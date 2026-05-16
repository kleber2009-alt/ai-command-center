"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

export default function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value.trim(),
      contact: (form.elements.namedItem("contact") as HTMLInputElement).value.trim(),
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value.trim(),
    };

    if (!data.name || !data.contact) {
      setStatus("error");
      setErrorMsg("Заполните имя и контакт для связи.");
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
      <div className="rounded-lg border border-accent/40 bg-accent/5 p-6 flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-white font-medium">Заявка отправлена</p>
          <p className="mt-1 text-sm text-white/65">
            Свяжемся с вами в течение часа в рабочее время. Если вопрос срочный — напишите нам напрямую справа.
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-4 text-sm text-accent hover:underline"
          >
            Отправить ещё одну
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-white/70 mb-1.5">Имя</label>
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          className="w-full rounded-md border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent transition-colors"
          placeholder="Как к вам обращаться"
        />
      </div>
      <div>
        <label className="block text-sm text-white/70 mb-1.5">Телефон или email</label>
        <input
          name="contact"
          type="text"
          required
          autoComplete="tel"
          className="w-full rounded-md border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent transition-colors"
          placeholder="+7 999 000-00-00"
        />
      </div>
      <div>
        <label className="block text-sm text-white/70 mb-1.5">
          Кратко о ситуации <span className="text-white/40">(необязательно)</span>
        </label>
        <textarea
          name="message"
          rows={4}
          className="w-full rounded-md border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-accent transition-colors resize-none"
          placeholder="Например: спор с подрядчиком, нужно подготовить претензию"
        />
      </div>

      {status === "error" && (
        <div className="flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-accent text-ink-950 font-medium hover:bg-accent-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
      >
        {status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === "loading" ? "Отправляем…" : "Отправить заявку"}
      </button>

      <p className="text-xs text-white/40">
        Нажимая кнопку, вы соглашаетесь на обработку персональных данных.
      </p>
    </form>
  );
}
