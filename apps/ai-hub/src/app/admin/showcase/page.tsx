// /admin/showcase — curation surface. Grid of recent media with feature-toggle.

import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";
import { FeatureToggle } from "./FeatureToggle";

export const dynamic = "force-dynamic";

export default async function AdminShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{ only?: string }>;
}) {
  const sp = await searchParams;
  const onlyFeatured = sp.only === "featured";

  const rows = await db.execute<{
    id: string; type: string; storage_path: string; created_at: Date;
    is_featured: boolean; tool_slug: string | null; user_email: string | null;
  }>(sql`
    select m.id, m.type, m.storage_path, m.created_at, m.is_featured,
           t.slug as tool_slug, u.email as user_email
    from media_assets m
    left join ai_jobs  j on j.id = m.job_id
    left join ai_tools t on t.id = j.tool_id
    left join users    u on u.id = m.user_id
    where m.type in ('image','video')
      ${onlyFeatured ? sql`and m.is_featured = true` : sql``}
    order by m.created_at desc
    limit 60
  `);

  const items = await Promise.all(
    (rows as unknown as Array<Record<string, unknown>>).map(async (r) => ({
      id: r.id as string,
      type: r.type as string,
      tool_slug: (r.tool_slug as string | null) ?? "—",
      user_email: ((r.user_email as string | null) ?? "?").slice(0, 24),
      is_featured: r.is_featured as boolean,
      url: await presignGet(r.storage_path as string, 60 * 60),
    }))
  );

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Admin · curation
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Showcase curation
          </h1>
          <div className="flex gap-2 text-xs font-mono">
            <a href="/admin/showcase"
               className={`px-3 py-1.5 rounded-md transition ${
                 !onlyFeatured ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"
               }`}>
              all
            </a>
            <a href="/admin/showcase?only=featured"
               className={`px-3 py-1.5 rounded-md transition ${
                 onlyFeatured ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"
               }`}>
              ★ featured
            </a>
          </div>
        </div>
        <p className="text-muted text-sm mt-3 max-w-2xl">
          Кликни ⭐ — медиа попадёт на публичный <a href="/showcase" className="text-accent hover:underline">/showcase</a>.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="glass p-12 text-muted text-center text-sm">
          {onlyFeatured ? "Пока ничего не отобрано." : "Медиа ещё нет."}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((m) => (
            <article key={m.id} className="glass overflow-hidden">
              <div className="relative aspect-square bg-bg/40 overflow-hidden">
                {m.type === "image" ? (
                  <img src={m.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <video src={m.url} muted preload="metadata" className="w-full h-full object-cover" />
                )}
                <div className="absolute top-2 right-2">
                  <FeatureToggle id={m.id} initial={m.is_featured} />
                </div>
              </div>
              <div className="p-3 text-xs">
                <div className="text-muted font-mono uppercase tracking-wider truncate">{m.tool_slug}</div>
                <div className="text-text/80 truncate mt-0.5">{m.user_email}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
