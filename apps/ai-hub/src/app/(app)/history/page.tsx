// History · jobs timeline with thumbnail previews + status pills + filter chips.
// Joins jobs → tools (for slug/name) → first media asset (for preview).

import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiJobs, aiTools } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { id: "all",       label: "all" },
  { id: "completed", label: "completed" },
  { id: "processing", label: "in flight" },
  { id: "failed",    label: "failed" },
  { id: "refunded",  label: "refunded" },
] as const;

const STATUS_META: Record<string, { dot: string; text: string; label: string }> = {
  pending:    { dot: "bg-muted/60",      text: "text-muted",       label: "pending" },
  queued:     { dot: "bg-accent/60",     text: "text-accent",      label: "queued" },
  processing: { dot: "bg-accent animate-pulse-ai", text: "text-accent", label: "processing" },
  completed:  { dot: "bg-green-400",     text: "text-green-300",   label: "completed" },
  failed:     { dot: "bg-red-400",       text: "text-red-300",     label: "failed" },
  refunded:   { dot: "bg-orange-400",    text: "text-orange-300",  label: "refunded" },
  cancelled:  { dot: "bg-muted",         text: "text-muted",       label: "cancelled" },
};

interface SearchParams { s?: string }

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return null;

  const activeTab = (sp.s ?? "all") as typeof STATUS_TABS[number]["id"];

  const jobs = await db.execute<{
    id: string; model: string | null; status: string;
    cost_tokens: number; charged_tokens: number | null;
    created_at: Date; error_message: string | null;
    input: unknown; tool_slug: string | null; tool_name: string | null;
    preview_path: string | null; preview_type: string | null;
  }>(sql`
    select
      j.id, j.model, j.status,
      j.cost_tokens, j.charged_tokens,
      j.created_at, j.error_message, j.input,
      t.slug as tool_slug, t.name as tool_name,
      (select m.storage_path from media_assets m where m.job_id = j.id and m.type in ('image','video') order by m.created_at asc limit 1) as preview_path,
      (select m.type from media_assets m where m.job_id = j.id and m.type in ('image','video') order by m.created_at asc limit 1) as preview_type
    from ai_jobs j
    left join ai_tools t on t.id = j.tool_id
    where j.user_id = ${user.id}
    order by j.created_at desc
    limit 80
  `);

  const rowsRaw = jobs as unknown as Array<{
    id: string; model: string | null; status: string;
    cost_tokens: number; charged_tokens: number | null;
    created_at: Date; error_message: string | null;
    input: unknown; tool_slug: string | null; tool_name: string | null;
    preview_path: string | null; preview_type: string | null;
  }>;

  const filtered = activeTab === "all"
    ? rowsRaw
    : activeTab === "processing"
    ? rowsRaw.filter((j) => ["pending", "queued", "processing"].includes(j.status))
    : rowsRaw.filter((j) => j.status === activeTab);

  // Counts for filter chips (over ALL rows, not filtered).
  const counts: Record<string, number> = { all: rowsRaw.length };
  for (const j of rowsRaw) counts[j.status] = (counts[j.status] ?? 0) + 1;
  counts.processing = (counts.pending ?? 0) + (counts.queued ?? 0) + (counts.processing ?? 0);

  // Presign previews for the (filtered) page.
  const rowsWithUrl = await Promise.all(filtered.map(async (j) => ({
    ...j,
    preview_url: j.preview_path ? await presignGet(j.preview_path, 60 * 60) : null,
    prompt: typeof j.input === "object" && j.input
      ? String((j.input as Record<string, unknown>).prompt ?? "")
      : "",
  })));

  function chipHref(s: string) {
    return s === "all" ? "/history" : `/history?s=${s}`;
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <header>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Activity
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">История генераций</h1>
          <div className="text-xs font-mono text-muted">
            {filtered.length} of {rowsRaw.length}
          </div>
        </div>
      </header>

      {/* ===== Filter chips ===== */}
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {STATUS_TABS.map((t) => {
          const n = counts[t.id] ?? 0;
          if (t.id !== "all" && n === 0) return null;
          const active = activeTab === t.id;
          return (
            <Link key={t.id} href={chipHref(t.id)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    active ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"
                  }`}>
              {t.label}{n > 0 && <span className="opacity-60"> · {n}</span>}
            </Link>
          );
        })}
      </div>

      {/* ===== Job stream ===== */}
      {rowsWithUrl.length === 0 ? (
        <div className="glass p-12 text-center">
          <div className="text-5xl opacity-40 mb-3">⏱</div>
          <div className="font-display text-xl font-semibold tracking-tight mb-1">
            {activeTab === "all" ? "Ещё ничего не запускал." : `Нет генераций со статусом «${activeTab}».`}
          </div>
          <p className="text-muted text-sm">
            {activeTab === "all"
              ? <>Открой <Link href="/tools" className="text-accent hover:underline">каталог</Link> и запусти первую.</>
              : <Link href="/history" className="text-accent hover:underline">Показать все →</Link>}
          </p>
        </div>
      ) : (
        <div className="glass divide-y divide-border overflow-hidden">
          {rowsWithUrl.map((j) => {
            const meta = STATUS_META[j.status] ?? STATUS_META.pending;
            const cost = j.charged_tokens ?? j.cost_tokens;
            return (
              <div key={j.id} className="px-5 py-4 flex items-start gap-4 hover:bg-white/[0.03] transition">
                {/* Preview */}
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-bg/40 border border-border grid place-items-center">
                  {j.preview_url ? (
                    j.preview_type === "video" ? (
                      <video src={j.preview_url} muted preload="metadata" className="w-full h-full object-cover" />
                    ) : (
                      <img src={j.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <span className="text-xl opacity-30">{j.status === "completed" ? "✓" : j.status === "failed" ? "✕" : "⏳"}</span>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-text">{j.tool_name ?? j.model ?? "—"}</span>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      <span className={meta.text}>{meta.label}</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted">{j.id.slice(0, 8)}</span>
                  </div>
                  {j.prompt && (
                    <p className="text-sm text-muted line-clamp-1 mt-1 leading-relaxed">{j.prompt}</p>
                  )}
                  {j.error_message && (
                    <p className="text-xs text-red-300/80 mt-1.5 leading-relaxed">{j.error_message}</p>
                  )}
                </div>

                {/* Cost + date */}
                <div className="text-right shrink-0 ml-2">
                  <div className="text-sm font-mono tabular-nums">
                    <span className="text-accent">✨</span>{cost}
                  </div>
                  <div className="text-[10px] text-muted mt-1 font-mono">
                    {j.created_at?.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {j.tool_slug && j.status === "completed" && (
                    <Link href={`/play/${j.tool_slug}`}
                          className="inline-block mt-1.5 text-[10px] font-mono text-accent hover:underline">
                      rerun →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
