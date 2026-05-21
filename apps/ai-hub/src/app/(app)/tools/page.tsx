// /tools · каталог инструментов в стиле /play playground.
// Header с total counter, filter chips по category, карточки с sample-preview
// (последняя выполненная генерация этого tool) и token-cost pill.

import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTools, aiJobs, mediaAssets } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";
import { ToolCover } from "@/components/ToolCover";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { id: "all",      label: "all" },
  { id: "image",    label: "image" },
  { id: "video",    label: "video" },
  { id: "face",     label: "face" },
  { id: "audio",    label: "audio" },
  { id: "content",  label: "content" },
  { id: "analysis", label: "analysis" },
] as const;

interface SearchParams { cat?: string }

export default async function ToolsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tools = await db.select({
    id:          aiTools.id,
    slug:        aiTools.slug,
    name:        aiTools.name,
    description: aiTools.description,
    category:    aiTools.category,
    provider:    aiTools.provider,
    model:       aiTools.model,
    token_cost:  aiTools.tokenCost,
    status:      aiTools.status,
  })
    .from(aiTools)
    .where(inArray(aiTools.status, ["active", "beta"]))
    .orderBy(asc(aiTools.sortOrder));

  // Один sample-preview per tool (latest media из completed job).
  const sampleRows = await db.execute<{ tool_id: string; storage_path: string; media_type: string }>(sql`
    select distinct on (j.tool_id)
      j.tool_id, m.storage_path, m.type as media_type
    from ai_jobs j
    join media_assets m on m.job_id = j.id
    where j.status = 'completed' and m.type in ('image','video')
    order by j.tool_id, m.created_at desc
  `);

  const sampleByToolId = new Map<string, { storage_path: string; type: string }>();
  for (const r of sampleRows as unknown as Array<Record<string, unknown>>) {
    sampleByToolId.set(r.tool_id as string, {
      storage_path: r.storage_path as string,
      type: r.media_type as string,
    });
  }

  // Presign только для тех tool-ов, по которым есть sample.
  const presigned = await Promise.all(
    Array.from(sampleByToolId.entries()).map(async ([toolId, s]) => [
      toolId, { url: await presignGet(s.storage_path, 60 * 60), type: s.type },
    ] as const)
  );
  const samplesMap = new Map(presigned);

  const activeCat = (sp.cat ?? "all") as typeof CATEGORIES[number]["id"];
  const filtered = activeCat === "all" ? tools : tools.filter((t) => t.category === activeCat);

  const counts: Record<string, number> = { all: tools.length };
  for (const t of tools) counts[t.category] = (counts[t.category] ?? 0) + 1;

  function chipHref(cat: string) {
    return cat === "all" ? "/tools" : `/tools?cat=${cat}`;
  }

  return (
    <div className="space-y-6">
      {/* ====== Page header ====== */}
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Каталог инструментов</h1>
          <p className="text-xs font-mono uppercase tracking-wider text-muted mt-2">
            {filtered.length} of {tools.length} · {activeCat}
          </p>
        </div>
        <Link href="/gallery"
              className="text-xs font-mono px-3 py-1.5 rounded-md bg-panel border border-border text-muted hover:text-text hover:border-accent transition">
          ⏱ View full history
        </Link>
      </header>

      {/* ====== Filter chips ====== */}
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {CATEGORIES.map((c) => {
          const n = counts[c.id] ?? 0;
          if (c.id !== "all" && n === 0) return null;
          const active = activeCat === c.id;
          return (
            <Link key={c.id} href={chipHref(c.id)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    active ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"
                  }`}>
              {c.label}{n > 0 && <span className="opacity-60"> · {n}</span>}
            </Link>
          );
        })}
      </div>

      {/* ====== Grid ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t) => {
          const sample = samplesMap.get(t.id);
          return (
            <Link key={t.slug} href={`/tools/${t.slug}`}
                  className="group panel overflow-hidden hover:border-accent transition flex flex-col">
              {/* Sample preview / placeholder */}
              <div className="relative aspect-[16/10] bg-bg/40 overflow-hidden border-b border-border">
                {sample ? (
                  sample.type === "video" ? (
                    <video src={sample.url} muted loop preload="metadata"
                           className="w-full h-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <img src={sample.url} alt=""
                         className="w-full h-full object-cover transition group-hover:scale-105"
                         loading="lazy" />
                  )
                ) : (
                  <ToolCover slug={t.slug} category={t.category} name={t.name} />
                )}
                <div className="absolute top-2 left-2 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-black/60 backdrop-blur text-white/90 border border-white/10">
                  {t.category}
                </div>
                {t.status === "beta" && (
                  <div className="absolute top-2 right-2 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-accent/30 backdrop-blur text-white border border-accent/40">
                    beta
                  </div>
                )}
              </div>

              {/* Card body */}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-text">{t.name}</div>
                  <div className="inline-flex items-center gap-1 text-xs font-mono text-muted shrink-0">
                    <span className="text-accent">✨</span>{t.token_cost}
                  </div>
                </div>
                {t.description && (
                  <p className="text-sm text-muted line-clamp-2 leading-relaxed">{t.description}</p>
                )}
                <div className="mt-auto pt-3 flex items-center justify-between border-t border-border/60">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted">
                    {t.provider} · {t.model.slice(0, 28)}
                  </div>
                  <div className="text-xs text-accent opacity-0 group-hover:opacity-100 transition">
                    Open →
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="glass p-8 text-muted text-sm text-center">
          В категории <span className="font-mono text-text">{activeCat}</span> пока ничего нет.
        </div>
      )}
    </div>
  );
}
