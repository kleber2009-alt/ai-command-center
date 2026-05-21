// /research/ig — input form for IG Research v0.
// Submit redirects to /research/ig/<jobId> which polls + renders the report.

import { IgResearchForm } from "./IgResearchForm";

export const dynamic = "force-dynamic";

export default function IgResearchEntry() {
  return (
    <div className="max-w-3xl mx-auto py-4">
      <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
        Research · Instagram · v0
      </div>
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
        Разбор Instagram-аккаунта
      </h1>
      <p className="text-muted mt-3 text-[15px] leading-relaxed max-w-xl">
        Парсим последние 12 постов аккаунта, прогоняем через Claude и отдаём отчёт:
        топ-хуки, визуальный стиль, паттерны вирусности, CTA, слабые места и actionable-фиксы.
      </p>

      <IgResearchForm />

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { e: "🪝", t: "Hooks",      d: "Топ хуки + почему работают" },
          { e: "🎨", t: "Visuals",    d: "Стиль · палитра · архетипы" },
          { e: "🔁", t: "Patterns",   d: "Что у вирусных постов общего" },
          { e: "⚠️", t: "Weaknesses", d: "3 слабых места + actionable fix" },
        ].map((b) => (
          <div key={b.t} className="glass p-4">
            <div className="text-2xl mb-1.5">{b.e}</div>
            <div className="font-medium text-sm">{b.t}</div>
            <p className="text-xs text-muted mt-1 leading-relaxed">{b.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
