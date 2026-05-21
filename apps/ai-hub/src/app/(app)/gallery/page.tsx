// /gallery · полная история сгенерированного контента.
// Каждый элемент — media_asset с привязкой к ai_job → ai_tool → input.prompt.
// Поддерживает фильтр по tool, фильтр favorites, hover-overlay с prompt + tool name.

import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaAssets, aiJobs, aiTools } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";
import { GalleryItemActions } from "./ItemActions";

export const dynamic = "force-dynamic";

interface SearchParams {
  tool?: string;
  fav?: string;
}

export default async function GalleryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return null;

  // Build conditions: own assets, optional tool filter, optional favorites filter.
  const conditions = [eq(mediaAssets.userId, user.id)];
  if (sp.fav === "1") conditions.push(eq(mediaAssets.isFavorite, true));

  // Join media → jobs → tools для tool slug + prompt
  // Drizzle relation joins не настроены, поэтому делаем raw join через query API.
  const rowsRaw = await db
    .select({
      id: mediaAssets.id,
      type: mediaAssets.type,
      storage_path: mediaAssets.storagePath,
      is_favorite: mediaAssets.isFavorite,
      created_at: mediaAssets.createdAt,
      mime_type: mediaAssets.mimeType,
      job_id: mediaAssets.jobId,
      tool_slug: aiTools.slug,
      tool_name: aiTools.name,
      tool_category: aiTools.category,
      job_input: aiJobs.input,
    })
    .from(mediaAssets)
    .leftJoin(aiJobs, eq(aiJobs.id, mediaAssets.jobId))
    .leftJoin(aiTools, eq(aiTools.id, aiJobs.toolId))
    .where(and(...conditions))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(80);

  let rows = rowsRaw;
  if (sp.tool) {
    rows = rows.filter((r) => r.tool_slug === sp.tool);
  }

  // Pre-signed URLs (TTL 1h) для каждой картинки/видео
  const items = await Promise.all(rows.map(async (r) => ({
    ...r,
    url: await presignGet(r.storage_path, 60 * 60),
    prompt: typeof r.job_input === "object" && r.job_input
      ? String((r.job_input as Record<string, unknown>).prompt ?? "")
      : "",
  })));

  // Список уникальных tools для фильтра-чипов
  const toolsRows = await db
    .select({
      slug: aiTools.slug,
      name: aiTools.name,
      n: sql<number>`count(*)::int`,
    })
    .from(mediaAssets)
    .innerJoin(aiJobs, eq(aiJobs.id, mediaAssets.jobId))
    .innerJoin(aiTools, eq(aiTools.id, aiJobs.toolId))
    .where(eq(mediaAssets.userId, user.id))
    .groupBy(aiTools.slug, aiTools.name)
    .orderBy(desc(sql`count(*)`));

  const totalCount = items.length;
  const favCount = items.filter((i) => i.is_favorite).length;

  function chipHref(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/gallery?${s}` : "/gallery";
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Gallery
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Галерея</h1>
          <div className="text-xs font-mono text-muted">
            {totalCount} {sp.tool ? `· ${sp.tool}` : ""}{sp.fav === "1" ? " · ★" : ""}
          </div>
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        <a href={chipHref({ fav: sp.fav })}
           className={`px-3 py-1.5 rounded-md ${!sp.tool ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"}`}>
          all
        </a>
        {toolsRows.map((t) => (
          <a key={t.slug} href={chipHref({ tool: t.slug, fav: sp.fav })}
             className={`px-3 py-1.5 rounded-md ${sp.tool === t.slug ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"}`}>
            {t.slug} <span className="opacity-60">· {t.n}</span>
          </a>
        ))}
        <span className="flex-1" />
        <a href={chipHref({ tool: sp.tool, fav: sp.fav === "1" ? undefined : "1" })}
           className={`px-3 py-1.5 rounded-md ${sp.fav === "1" ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"}`}>
          {sp.fav === "1" ? "★ favorites" : "☆ favorites"} {favCount > 0 && <span className="opacity-60">· {favCount}</span>}
        </a>
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="glass p-8 text-muted text-sm">
          Пока ничего не сгенерировано. Начни с <a href="/tools" className="text-accent">каталога</a> или открой{" "}
          <a href="/play/nano-banana-2" className="text-accent">Nano Banana 2 →</a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((m) => (
            <article key={m.id} className="group relative rounded-xl overflow-hidden border border-border bg-panel hover:border-accent transition">
              <a href={m.url} target="_blank" rel="noreferrer" className="block">
                {m.type === "image" && (
                  <img src={m.url} alt="" className="w-full aspect-square object-cover block" loading="lazy" />
                )}
                {m.type === "video" && (
                  <video src={m.url} className="w-full aspect-square object-cover block" muted preload="metadata" />
                )}
                {m.type === "audio" && (
                  <div className="aspect-square grid place-items-center text-muted text-xs">audio</div>
                )}
              </a>

              {/* Hover overlay — prompt + tool */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent
                              opacity-0 group-hover:opacity-100 transition pointer-events-none p-3">
                {m.tool_name && (
                  <div className="text-[10px] font-mono text-accent uppercase tracking-wider mb-1">
                    {m.tool_slug}
                  </div>
                )}
                {m.prompt && (
                  <p className="text-xs text-white/90 line-clamp-3">{m.prompt}</p>
                )}
              </div>

              {/* Top-right actions */}
              <div className="absolute top-2 right-2 flex gap-1.5 z-10">
                <GalleryItemActions id={m.id} isFavorite={!!m.is_favorite} url={m.url} />
              </div>

              {/* Footer meta */}
              <footer className="px-3 py-2 text-[11px] text-muted flex justify-between font-mono border-t border-border">
                <span>{m.type}</span>
                <span>{m.created_at?.toLocaleDateString()}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
