// /showcase — public-ish gallery of community-best generations.
// Only is_featured=true media. Editors curate via /admin/showcase toggle.

import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ShowcasePage() {
  const rows = await db.execute<{
    id: string; type: string; storage_path: string; featured_at: Date;
    tool_slug: string | null; tool_name: string | null; prompt: string | null;
  }>(sql`
    select
      m.id, m.type, m.storage_path, m.featured_at,
      t.slug as tool_slug, t.name as tool_name,
      coalesce(j.input->>'prompt','') as prompt
    from media_assets m
    left join ai_jobs j  on j.id = m.job_id
    left join ai_tools t on t.id = j.tool_id
    where m.is_featured = true
    order by m.featured_at desc nulls last, m.created_at desc
    limit 80
  `);

  const items = await Promise.all(
    (rows as unknown as Array<Record<string, unknown>>).map(async (r) => ({
      id: r.id as string,
      type: r.type as string,
      tool_slug: (r.tool_slug as string | null) ?? null,
      tool_name: (r.tool_name as string | null) ?? null,
      prompt: (r.prompt as string | null) ?? "",
      url: await presignGet(r.storage_path as string, 60 * 60),
    }))
  );

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Showcase · curated
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Community showcase
          </h1>
          <div className="text-xs font-mono text-muted">{items.length} works</div>
        </div>
        <p className="text-muted text-sm mt-3 max-w-2xl leading-relaxed">
          Лучшие генерации сообщества — отобраны вручную. Хочешь попасть сюда?
          Нажми ⭐ на своей работе в <Link href="/gallery" className="text-accent hover:underline">галерее</Link> — мы посмотрим.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="glass p-16 text-center">
          <div className="text-5xl opacity-40 mb-4">✨</div>
          <div className="font-display text-xl font-semibold tracking-tight mb-1">
            Showcase is being curated.
          </div>
          <p className="text-muted text-sm max-w-md mx-auto">
            Пока кураторы не отметили работы — этот раздел появится здесь скоро.
            <br />А пока — <Link href="/gallery" className="text-accent hover:underline">открой свою галерею</Link>.
          </p>
        </div>
      ) : (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {items.map((m) => (
            <Link key={m.id} href={m.tool_slug ? `/play/${m.tool_slug}` : "/gallery"}
                  className="block break-inside-avoid relative group rounded-xl overflow-hidden border border-border hover:border-accent/40 transition">
              {m.type === "image" && (
                <img src={m.url} alt="" loading="lazy"
                     className="w-full h-auto block transition group-hover:scale-[1.02]" />
              )}
              {m.type === "video" && (
                <video src={m.url} muted preload="metadata" className="w-full h-auto block" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent
                              opacity-0 group-hover:opacity-100 transition pointer-events-none p-3 flex flex-col justify-end">
                {m.tool_name && (
                  <div className="text-[10px] font-mono text-accent uppercase tracking-wider mb-1">
                    {m.tool_slug}
                  </div>
                )}
                {m.prompt && (
                  <p className="text-xs text-white/90 line-clamp-3">{m.prompt}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
