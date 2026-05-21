"use client";

// Reels Creator v1 — multi-agent live timeline.
//
// Flow:
//   1. Form submit → POST /api/tools/reels-creator/run → returns { job: {id} }
//   2. Open EventSource /api/agents/by-job/<jobId>/stream
//   3. Render live phase timeline: each phase as a row that flips from
//      pending → thinking (pulse) → completed (with output snippet)
//   4. On run_completed → render full ReelsPackage with copy/visual-handoff buttons

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Strategy { positioning: string; audience: string; angles: string[]; hot_take: string }
interface HookOutput { chosen: { text: string; type: string; why_works: string };
                       alternatives: Array<{ text: string; type: string }> }
interface Slide { n: number; angle: string; voiceover: string; visual_brief: string; camera_motion: string }
interface Copy { caption: string; hashtags: string[]; cta: string; estimated_duration_sec: number }
interface QA { score: number; strengths: string[]; risks: string[]; recommendations: string[] }

interface ReelsPackageV1 {
  strategy: Strategy;
  hook: HookOutput;
  slides: Slide[];
  copy: Copy;
  qa: QA;
  meta?: { language: string; agents_used: string[] };
}

interface AgentEvent {
  seq: number;
  phase: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface PhaseDef {
  id: string;
  label: string;
  emoji: string;
  goal: string;
}

const PHASES: PhaseDef[] = [
  { id: "strategist",      label: "Strategist",      emoji: "🧭", goal: "Find the angle" },
  { id: "hook_writer",     label: "Hook Writer",     emoji: "🪝", goal: "First 2 seconds" },
  { id: "visual_director", label: "Visual Director", emoji: "🎬", goal: "Storyboard 5 slides" },
  { id: "copywriter",      label: "Copywriter",      emoji: "✍️", goal: "Caption + hashtags + CTA" },
  { id: "qa",              label: "QA Reviewer",     emoji: "🔎", goal: "Score the package" },
];

const NICHES = ["стилист / fashion", "фитнес / coach", "онлайн-школа / эксперт",
  "e-commerce / бренд", "beauty / SMM", "недвижимость", "food / ресторан", "другое"];

const TONES = [
  { id: "premium",   label: "Premium · luxury" },
  { id: "energy",    label: "High-energy" },
  { id: "expert",    label: "Educational" },
  { id: "playful",   label: "Playful / fun" },
  { id: "moody",     label: "Moody / cinematic" },
  { id: "honest",    label: "Honest / no-bs" },
];

export function ReelsAgent() {
  const router = useRouter();
  const [niche, setNiche] = useState(NICHES[0]);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState(TONES[0].id);
  const [language, setLanguage] = useState<"ru" | "en">("ru");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [runStatus, setRunStatus] = useState<"pending" | "running" | "completed" | "failed">("pending");
  const [pkg, setPkg] = useState<ReelsPackageV1 | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // SSE connection
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/agents/by-job/${jobId}/stream`);
    esRef.current = es;
    es.addEventListener("event", (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as AgentEvent;
        setEvents((prev) => [...prev, ev]);
        if (ev.event_type === "phase_completed" && ev.phase === "qa") {
          // Final assembly pending — wait for run_completed
        }
        if (ev.event_type === "run_completed") {
          setRunStatus("completed");
        }
        if (ev.event_type === "run_failed" || ev.event_type === "phase_failed") {
          setRunStatus("failed");
        }
      } catch { /* skip */ }
    });
    es.addEventListener("run", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { status: string; error?: string };
        if (data.status === "running")   setRunStatus("running");
        if (data.status === "completed") setRunStatus("completed");
        if (data.status === "failed")    { setRunStatus("failed"); if (data.error) setError(data.error); }
      } catch { /* skip */ }
    });
    es.addEventListener("error", () => { /* connection drop — server will close, browser auto-retries */ });
    return () => { es.close(); esRef.current = null; };
  }, [jobId]);

  // Once run completed → pull full package from ai_jobs.output
  useEffect(() => {
    if (runStatus !== "completed" || !jobId || pkg) return;
    (async () => {
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!r.ok) return;
      const { job } = await r.json();
      const out = job?.output as { reels_v1?: ReelsPackageV1 } | null;
      if (out?.reels_v1) setPkg(out.reels_v1);
    })();
  }, [runStatus, jobId, pkg]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) { setError("Опиши тему ролика"); return; }
    setError(null); setEvents([]); setPkg(null); setRunStatus("pending"); setSubmitting(true);
    try {
      const r = await fetch("/api/tools/reels-creator/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { niche, topic: topic.trim(), tone, language } }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error === "insufficient_funds"
          ? `Недостаточно токенов (нужно ${data.required}).`
          : data.error ?? `HTTP ${r.status}`);
        setSubmitting(false); return;
      }
      setJobId(data.job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    esRef.current?.close();
    setJobId(null); setEvents([]); setPkg(null); setError(null); setRunStatus("pending");
  }

  // ===== Derive per-phase state from events =====
  const phaseState: Record<string, { status: "idle" | "thinking" | "completed" | "failed"; output?: unknown; tip?: string }> = {};
  for (const p of PHASES) phaseState[p.id] = { status: "idle" };
  for (const ev of events) {
    const cur = phaseState[ev.phase] ?? { status: "idle" };
    if (ev.event_type === "phase_started")   phaseState[ev.phase] = { ...cur, status: "thinking" };
    if (ev.event_type === "phase_thinking")  phaseState[ev.phase] = { ...cur, status: "thinking", tip: String(ev.payload?.tip ?? "") };
    if (ev.event_type === "phase_completed") phaseState[ev.phase] = { status: "completed", output: ev.payload?.output };
    if (ev.event_type === "phase_failed")    phaseState[ev.phase] = { status: "failed",    output: ev.payload };
  }

  return (
    <div className="max-w-5xl mx-auto py-4">
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          AI Agents · Reels Creator · v1 · multi-agent
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          5 агентов соберут твой Reels.
        </h1>
        <p className="text-muted mt-3 text-[15px] leading-relaxed max-w-xl">
          Strategist → Hook Writer → Visual Director → Copywriter → QA. Каждый шаг — отдельный Claude-агент с фокусом,
          живой timeline и промежуточными артефактами. 60 ток.
        </p>
      </div>

      {!jobId ? (
        <BriefForm niche={niche} setNiche={setNiche} topic={topic} setTopic={setTopic}
                   tone={tone} setTone={setTone} language={language} setLanguage={setLanguage}
                   submit={submit} submitting={submitting} error={error} />
      ) : (
        <div className="space-y-6">
          {/* Live phase timeline */}
          <Timeline phaseState={phaseState} runStatus={runStatus} />

          {/* Once completed — full report */}
          {pkg && <ReelsPackageView pkg={pkg} router={router} />}

          {runStatus === "failed" && (
            <div className="glass p-5 border-red-400/30">
              <div className="font-display text-lg font-semibold mb-1">Multi-agent failed</div>
              <p className="text-sm text-muted">{error ?? "Один из агентов не справился. Токены возвращены."}</p>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <button onClick={reset} className="text-accent hover:underline">← Новый запрос</button>
            <span className="font-mono text-muted">run · {jobId.slice(0, 8)} · {runStatus}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefForm(p: {
  niche: string; setNiche: (s: string) => void;
  topic: string; setTopic: (s: string) => void;
  tone: string; setTone: (s: string) => void;
  language: "ru" | "en"; setLanguage: (l: "ru" | "en") => void;
  submit: (e: React.FormEvent) => void;
  submitting: boolean; error: string | null;
}) {
  return (
    <form onSubmit={p.submit} className="glass p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1.5">Ниша</label>
          <select value={p.niche} onChange={(e) => p.setNiche(e.target.value)} className="input">
            {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Язык контента</label>
          <div className="grid grid-cols-2 gap-2">
            {([["ru", "Русский"], ["en", "English"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => p.setLanguage(id)}
                      className={`px-3 py-2.5 rounded-lg text-sm border transition ${
                        p.language === id ? "bg-accent/15 border-accent text-accent" : "bg-white/[0.03] border-border text-muted hover:text-text"
                      }`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5">Тема ролика <span className="text-red-400">*</span></label>
        <textarea value={p.topic} onChange={(e) => p.setTopic(e.target.value)}
                  rows={3} maxLength={500}
                  placeholder="Например: 5 ошибок при выборе пальто на зиму"
                  className="input resize-y" />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5">Тон / настроение</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {TONES.map((t) => (
            <button key={t.id} type="button" onClick={() => p.setTone(t.id)}
                    className={`px-3 py-2.5 rounded-lg text-sm border transition text-left ${
                      p.tone === t.id ? "bg-accent/15 border-accent text-accent" : "bg-white/[0.03] border-border text-muted hover:text-text"
                    }`}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-5 flex items-center justify-between">
        <span className="text-xs text-muted">Стоимость: <span className="font-mono text-accent">✨ 60 токенов</span></span>
        <button type="submit" disabled={p.submitting || !p.topic.trim()} className="btn gap-2">
          {p.submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              <span>Запускаю команду…</span>
            </>
          ) : (
            <>
              <span>Запустить агентов</span><span className="text-xs opacity-70">↵</span>
            </>
          )}
        </button>
      </div>
      {p.error && <div className="text-red-300 text-sm">{p.error}</div>}
    </form>
  );
}

function Timeline({ phaseState, runStatus }: {
  phaseState: Record<string, { status: "idle" | "thinking" | "completed" | "failed"; output?: unknown; tip?: string }>;
  runStatus: "pending" | "running" | "completed" | "failed";
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight">Live agent timeline</h2>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">
          {runStatus === "completed" ? "✓ done" : runStatus === "failed" ? "✕ failed" : "running"}
        </span>
      </div>
      <div className="space-y-2">
        {PHASES.map((p, i) => {
          const state = phaseState[p.id];
          return <PhaseRow key={p.id} idx={i + 1} phase={p} state={state} />;
        })}
      </div>
    </section>
  );
}

function PhaseRow({ idx, phase, state }: {
  idx: number; phase: PhaseDef;
  state: { status: "idle" | "thinking" | "completed" | "failed"; output?: unknown; tip?: string };
}) {
  const active = state.status === "thinking";
  const done   = state.status === "completed";
  const failed = state.status === "failed";

  return (
    <article className={`glass p-4 grid grid-cols-[auto,auto,1fr,auto] gap-4 items-start transition ${
      active ? "shadow-glow ring-1 ring-accent/30" : ""
    }`}>
      {/* Step number */}
      <div className={`w-8 h-8 rounded-lg grid place-items-center text-xs font-display font-bold transition ${
        done ? "bg-accent-grad text-white" :
        active ? "bg-accent/20 text-accent" :
        failed ? "bg-red-500/20 text-red-300" : "bg-white/5 text-muted"
      }`}>{idx}</div>

      {/* Agent identity */}
      <div className="w-10 shrink-0 text-2xl text-center">{phase.emoji}</div>

      {/* Body */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{phase.label}</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted">— {phase.goal}</span>
        </div>
        {state.tip && active && (
          <p className="text-xs text-muted mt-1.5 leading-relaxed">{state.tip}</p>
        )}
        {done && state.output != null && <PhaseOutput phase={phase.id} output={state.output} />}
      </div>

      {/* Status indicator */}
      <div className="pt-1 shrink-0">
        {active && (
          <div className="relative w-5 h-5">
            <div className="absolute inset-0 rounded-full bg-accent/30 animate-ping" />
            <div className="absolute inset-1 rounded-full bg-accent-grad animate-pulse-ai" />
          </div>
        )}
        {done   && <span className="text-accent text-lg">✓</span>}
        {failed && <span className="text-red-300 text-lg">✕</span>}
        {state.status === "idle" && <span className="text-muted/40 text-lg">·</span>}
      </div>
    </article>
  );
}

function PhaseOutput({ phase, output }: { phase: string; output: unknown }) {
  if (output == null || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  if (phase === "strategist") {
    return (
      <div className="mt-2 space-y-1.5 text-xs text-text/80">
        <div><span className="text-muted">Positioning:</span> {String(o.positioning ?? "")}</div>
        <div><span className="text-muted">Hot take:</span> {String(o.hot_take ?? "")}</div>
      </div>
    );
  }
  if (phase === "hook_writer") {
    const chosen = (o.chosen ?? {}) as { text?: string; type?: string };
    return (
      <div className="mt-2 text-xs">
        <span className="text-muted">Chosen ({chosen.type}):</span>{" "}
        <span className="text-text/90 font-medium">"{chosen.text ?? ""}"</span>
      </div>
    );
  }
  if (phase === "visual_director") {
    const slides = (o.slides ?? []) as Array<{ n: number; angle: string }>;
    return (
      <div className="mt-2 text-xs text-muted leading-relaxed">
        {slides.length} кадров: {slides.map((s) => s.angle).join(" · ")}
      </div>
    );
  }
  if (phase === "copywriter") {
    return (
      <div className="mt-2 text-xs text-text/80">
        Caption: <span className="text-muted">"{String((o.caption ?? "")).slice(0, 100)}…"</span>
      </div>
    );
  }
  if (phase === "qa") {
    const score = Number(o.score ?? 0);
    return (
      <div className="mt-2 text-xs">
        <span className="text-muted">Score:</span>{" "}
        <span className={`font-mono font-medium ${score >= 70 ? "text-green-400" : score >= 50 ? "text-accent" : "text-orange-300"}`}>
          {score}/100
        </span>
      </div>
    );
  }
  return null;
}

function ReelsPackageView({ pkg, router }: { pkg: ReelsPackageV1; router: ReturnType<typeof useRouter> }) {
  function generateVisual(brief: string) {
    router.push(`/play/nano-banana-2?prompt=${encodeURIComponent(brief)}`);
  }
  function copy(text: string) { void navigator.clipboard.writeText(text); }
  const scoreColor = pkg.qa.score >= 70 ? "text-green-400" : pkg.qa.score >= 50 ? "text-accent" : "text-orange-300";

  return (
    <div className="space-y-6 pt-2">
      <div className="border-t border-border pt-6 space-y-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Final package</h2>
          <div className={`font-mono text-sm ${scoreColor}`}>QA · {pkg.qa.score}/100</div>
        </div>

        {/* Strategy summary */}
        <section className="glass p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent mb-2">🧭 Strategy</div>
          <div className="text-sm space-y-1.5">
            <div><span className="text-muted">Positioning:</span> {pkg.strategy.positioning}</div>
            <div><span className="text-muted">Audience:</span> {pkg.strategy.audience}</div>
            <div><span className="text-muted">Hot take:</span> {pkg.strategy.hot_take}</div>
          </div>
        </section>

        {/* Hook */}
        <section className="glass p-6 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">🪝 Hook · {pkg.hook.chosen.type}</div>
            <button onClick={() => copy(pkg.hook.chosen.text)} className="text-[10px] text-muted hover:text-text font-mono">copy</button>
          </div>
          <p className="text-xl md:text-2xl font-display font-semibold leading-tight tracking-tight">"{pkg.hook.chosen.text}"</p>
          <p className="text-sm text-muted leading-relaxed">{pkg.hook.chosen.why_works}</p>

          {pkg.hook.alternatives.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer hover:text-text">+ {pkg.hook.alternatives.length} альтернатив</summary>
              <div className="mt-2 space-y-1.5">
                {pkg.hook.alternatives.map((alt, i) => (
                  <div key={i}>
                    <span className="opacity-60">[{alt.type}]</span> "{alt.text}"
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        {/* Slides */}
        <section>
          <h3 className="font-display text-xl font-semibold tracking-tight mb-3">
            🎬 5 кадров · ≈{pkg.copy.estimated_duration_sec}с
          </h3>
          <div className="space-y-3">
            {pkg.slides.map((s) => (
              <article key={s.n} className="glass p-5 grid grid-cols-1 md:grid-cols-[auto,1fr,auto] gap-5 items-start">
                <div className="w-9 h-9 rounded-lg bg-accent-grad grid place-items-center text-sm font-display font-bold text-white shrink-0">
                  {s.n}
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">Angle · {s.camera_motion}</div>
                  <p className="text-sm font-medium">{s.angle}</p>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted mt-2">Voiceover</div>
                  <p className="text-sm text-text/90 leading-relaxed">"{s.voiceover}"</p>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted mt-2">Visual brief</div>
                  <p className="text-xs text-muted leading-relaxed font-mono">{s.visual_brief}</p>
                </div>
                <button onClick={() => generateVisual(s.visual_brief)}
                        className="btn-ghost text-xs gap-1.5 whitespace-nowrap self-start md:self-center">
                  <span>🍌</span><span>Visual →</span>
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* Copy */}
        <section className="glass p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">✍️ Caption</div>
            <button onClick={() => copy(pkg.copy.caption)} className="text-[10px] text-muted hover:text-text font-mono">copy</button>
          </div>
          <p className="text-base leading-relaxed whitespace-pre-line">{pkg.copy.caption}</p>
          <div className="border-t border-border pt-3 flex flex-wrap gap-1.5 items-center">
            {pkg.copy.hashtags.map((h, i) => (
              <span key={i} className="text-xs font-mono text-accent">{h.startsWith("#") ? h : `#${h}`}</span>
            ))}
            <button onClick={() => copy(pkg.copy.hashtags.map((h) => h.startsWith("#") ? h : `#${h}`).join(" "))}
                    className="ml-auto text-[10px] text-muted hover:text-text font-mono">copy all</button>
          </div>
        </section>

        {/* CTA + QA */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="glass p-5">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent-pink mb-2">📣 CTA</div>
            <p className="text-sm font-medium leading-relaxed">{pkg.copy.cta}</p>
          </div>
          <div className="glass p-5">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent-cyan mb-2">🔎 QA Review</div>
            {pkg.qa.recommendations.length > 0 && (
              <ul className="text-sm space-y-1 leading-relaxed">
                {pkg.qa.recommendations.map((r, i) => (
                  <li key={i} className="text-text/90">→ {r}</li>
                ))}
              </ul>
            )}
            {pkg.qa.risks.length > 0 && (
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer hover:text-text">Risks ({pkg.qa.risks.length})</summary>
                <ul className="mt-2 space-y-1">
                  {pkg.qa.risks.map((r, i) => <li key={i}>· {r}</li>)}
                </ul>
              </details>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
