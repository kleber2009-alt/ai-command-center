"use client";

// Polls /api/jobs/<jobId> every 2s; once status=completed renders the report.

import { useEffect, useState } from "react";
import Link from "next/link";

interface Report {
  account: {
    username: string;
    total_posts_analyzed: number;
    reels_count: number;
    avg_likes: number;
    avg_comments: number;
    top_post_url: string | null;
    top_post_engagement: number;
  };
  posts: Array<{
    shortCode?: string; url?: string; type?: string; isReel: boolean;
    caption: string; likes: number; comments: number; plays: number; posted_at: string | null;
  }>;
  summary: {
    headline: string; top_hook: string; avg_engagement: number;
    reels_ratio: number; viral_pattern: string; best_caption_length: string;
  };
  hooks: Array<{ text: string; engagement_score: number; type: string; why_works: string }>;
  visuals: { dominant_style: string; color_palette_hint: string; content_archetypes: string[] };
  ctas: Array<{ pattern: string; frequency: string; effectiveness: string }>;
  weaknesses: Array<{ area: string; finding: string; fix: string }>;
}

interface Job {
  id: string;
  status: "pending" | "queued" | "processing" | "completed" | "failed" | "refunded" | "cancelled";
  output: { report: Report; source?: string; version?: string } | null;
  error_message: string | null;
  created_at: string;
}

export function ReportView({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let tries = 0;
    async function tick() {
      while (!stopped && tries < 90) {                  // 3 минуты максимум
        tries++;
        try {
          const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
          if (r.ok) {
            const { job: j } = await r.json();
            setJob(j);
            if (j.status === "completed" || j.status === "failed" || j.status === "refunded" || j.status === "cancelled") return;
          }
        } catch (e) {
          setPollError(e instanceof Error ? e.message : String(e));
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    void tick();
    return () => { stopped = true; };
  }, [jobId]);

  if (!job) return <LoadingState text="Загружаю задачу…" />;

  if (job.status === "pending" || job.status === "queued" || job.status === "processing") {
    return <LoadingState text={job.status === "processing" ? "Анализирую аккаунт через Apify + Claude…" : "В очереди…"} />;
  }
  if (job.status === "failed" || job.status === "refunded" || job.status === "cancelled") {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="glass p-8 text-center border-red-400/30">
          <div className="text-4xl opacity-50 mb-3">✕</div>
          <div className="font-display text-xl font-semibold tracking-tight mb-2">
            Анализ не получился
          </div>
          <p className="text-muted text-sm leading-relaxed">{job.error_message ?? job.status}</p>
          <p className="text-xs text-muted mt-3">
            Токены вернулись на баланс {job.status === "refunded" ? "автоматически" : "если был статус failed/refunded"}.
          </p>
          <Link href="/research/ig" className="btn mt-5 inline-flex">Попробовать снова</Link>
        </div>
      </div>
    );
  }

  const report = job.output?.report;
  if (!report) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="glass p-8 text-center">
          <p className="text-muted">Report payload is empty.</p>
        </div>
      </div>
    );
  }

  return <Report data={report} />;
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="max-w-3xl mx-auto py-12">
      <div className="glass p-12 text-center">
        <div className="relative w-16 h-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
          <div className="absolute inset-3 rounded-full bg-accent-grad shadow-glow-lg animate-pulse-ai" />
        </div>
        <div className="font-display text-xl font-semibold tracking-tight mb-1">{text}</div>
        <p className="text-muted text-sm">Обычно занимает 40-90 секунд.</p>
      </div>
    </div>
  );
}

function Report({ data }: { data: Report }) {
  const palette = (data.visuals.color_palette_hint ?? "").split(",")
    .map((s) => s.trim()).filter((s) => /^#?[0-9a-f]{3,8}$/i.test(s));

  return (
    <div className="space-y-8">
      {/* ===== Header ===== */}
      <header>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Research · @{data.account.username}
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            @{data.account.username}
          </h1>
          <a href={`https://instagram.com/${data.account.username}`} target="_blank" rel="noreferrer"
             className="text-sm text-accent hover:underline">Открыть в Instagram ↗</a>
        </div>
        <p className="text-text/90 mt-4 text-lg leading-relaxed max-w-3xl">{data.summary.headline}</p>
      </header>

      {/* ===== Metrics row ===== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Постов проанализировано" value={data.account.total_posts_analyzed} />
        <Stat label="Reels"      value={`${data.account.reels_count} / ${data.account.total_posts_analyzed}`} />
        <Stat label="Avg likes"   value={data.account.avg_likes.toLocaleString()} accent />
        <Stat label="Avg комментариев" value={data.account.avg_comments.toLocaleString()} />
      </section>

      {/* ===== Summary block ===== */}
      <section className="glass p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Сводка</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Top hook</div>
            <p className="leading-relaxed">{data.summary.top_hook}</p>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Viral pattern</div>
            <p className="leading-relaxed">{data.summary.viral_pattern}</p>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Reels-ratio</div>
            <p className="leading-relaxed">{Math.round(data.summary.reels_ratio * 100)}% постов — Reels</p>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Best caption length</div>
            <p className="leading-relaxed font-mono">{data.summary.best_caption_length}</p>
          </div>
        </div>
      </section>

      {/* ===== Hooks ===== */}
      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight mb-3">🪝 Hooks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.hooks.map((h, i) => (
            <div key={i} className="glass p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-accent">{h.type}</div>
                <div className="font-mono text-xs text-muted">{h.engagement_score}/100</div>
              </div>
              <p className="text-sm font-medium leading-snug">"{h.text}"</p>
              <p className="text-xs text-muted leading-relaxed">{h.why_works}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Visuals ===== */}
      <section className="glass p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">🎨 Visuals</h2>
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-1">Стиль</div>
          <p className="text-sm leading-relaxed">{data.visuals.dominant_style}</p>
        </div>
        {palette.length > 0 && (
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-2">Палитра</div>
            <div className="flex gap-2 items-center">
              {palette.map((c) => {
                const hex = c.startsWith("#") ? c : `#${c}`;
                return (
                  <div key={hex} className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg border border-border" style={{ background: hex }} />
                    <span className="text-xs font-mono text-muted">{hex.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {data.visuals.content_archetypes.length > 0 && (
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-2">Архетипы контента</div>
            <div className="flex flex-wrap gap-2">
              {data.visuals.content_archetypes.map((a) => (
                <span key={a} className="text-xs font-mono px-2.5 py-1 rounded-md bg-white/5 border border-border text-text/80">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===== CTAs ===== */}
      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight mb-3">📣 CTAs</h2>
        <div className="glass divide-y divide-border overflow-hidden">
          {data.ctas.map((c, i) => (
            <div key={i} className="px-5 py-3.5 grid grid-cols-12 gap-3 items-start">
              <div className="col-span-12 md:col-span-7 text-sm leading-relaxed">{c.pattern}</div>
              <div className="col-span-6 md:col-span-2 text-xs text-muted font-mono">{c.frequency}</div>
              <div className="col-span-6 md:col-span-3 text-xs leading-relaxed">{c.effectiveness}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Weaknesses ===== */}
      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight mb-3">⚠️ Слабые места</h2>
        <div className="space-y-3">
          {data.weaknesses.map((w, i) => (
            <div key={i} className="glass p-5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-accent-pink mb-1">{w.area}</div>
              <p className="text-sm font-medium mb-2">{w.finding}</p>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">Fix</div>
              <p className="text-sm text-text/90 leading-relaxed">→ {w.fix}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Posts table ===== */}
      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight mb-3">Посты в анализе</h2>
        <div className="glass divide-y divide-border overflow-hidden text-sm">
          {data.posts.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noreferrer"
               className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-white/[0.03] transition">
              <div className="col-span-1 text-xs text-muted font-mono">{i + 1}</div>
              <div className="col-span-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${
                  p.isReel ? "bg-accent/20 text-accent" : "bg-white/5 text-muted"
                }`}>{p.isReel ? "reel" : "post"}</span>
              </div>
              <div className="col-span-6 truncate text-muted">{p.caption || "—"}</div>
              <div className="col-span-1 text-right tabular-nums">{p.likes.toLocaleString()}</div>
              <div className="col-span-1 text-right tabular-nums text-muted">{p.comments}</div>
              <div className="col-span-1 text-right tabular-nums text-muted text-xs">{p.plays ? p.plays.toLocaleString() : "—"}</div>
              <div className="col-span-1 text-right text-accent text-xs">↗</div>
            </a>
          ))}
        </div>
      </section>

      <div className="pt-4 flex items-center justify-between text-xs text-muted">
        <Link href="/research/ig" className="text-accent hover:underline">← Новый анализ</Link>
        <span className="font-mono">analyzer v0 · apify+claude-haiku</span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="glass p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`font-display font-semibold tabular-nums mt-2 text-2xl md:text-3xl ${
        accent ? "bg-accent-grad bg-clip-text text-transparent" : ""
      }`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
