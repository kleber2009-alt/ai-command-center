// Dashboard · "Creator OS" home.
// HERO copy + QuickPromptBar (client) → trending tools carousel → masonry of recent generations.
// For tools without real samples → ToolCover renders a deterministic gradient with icon.
// For users with no own media → falls back to community-recent (last 12 globally).

import Link from "next/link";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiTools, mediaAssets } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";
import { QuickPromptBar } from "./QuickPromptBar";
import { ToolCover } from "@/components/ToolCover";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as { id?: string; name?: string; email?: string } | undefined;
  if (!user?.id) return null;

  const [tools, samples, recentMine] = await Promise.all([
    db.select({
      id: aiTools.id, slug: aiTools.slug, name: aiTools.name,
      category: aiTools.category, provider: aiTools.provider,
      token_cost: aiTools.tokenCost, description: aiTools.description,
    })
      .from(aiTools).where(inArray(aiTools.status, ["active", "beta"]))
      .orderBy(asc(aiTools.sortOrder)).limit(8),

    db.execute<{ tool_id: string; storage_path: string; media_type: string }>(sql`
      select distinct on (j.tool_id)
        j.tool_id, m.storage_path, m.type as media_type
      from ai_jobs j
      join media_assets m on m.job_id = j.id
      where j.status = 'completed' and m.type in ('image','video')
      order by j.tool_id, m.created_at desc
    `),

    db.select({
      id: mediaAssets.id, type: mediaAssets.type,
      storage_path: mediaAssets.storagePath, created_at: mediaAssets.createdAt,
    })
      .from(mediaAssets).where(eq(mediaAssets.userId, user.id))
      .orderBy(desc(mediaAssets.createdAt)).limit(12),
  ]);

  // Если у юзера нет своих работ — берём community-showcase (любого юзера).
  let recentRows = recentMine;
  let isCommunity = false;
  if (recentMine.length === 0) {
    const community = await db.select({
      id: mediaAssets.id, type: mediaAssets.type,
      storage_path: mediaAssets.storagePath, created_at: mediaAssets.createdAt,
    })
      .from(mediaAssets)
      .where(inArray(mediaAssets.type, ["image", "video"]))
      .orderBy(desc(mediaAssets.createdAt)).limit(12);
    recentRows = community;
    isCommunity = community.length > 0;
  }

  const sampleByToolId = new Map<string, { storage_path: string; type: string }>();
  for (const r of samples as unknown as Array<Record<string, unknown>>) {
    sampleByToolId.set(r.tool_id as string, {
      storage_path: r.storage_path as string, type: r.media_type as string,
    });
  }
  const sampleEntries = await Promise.all(
    Array.from(sampleByToolId.entries()).map(async ([toolId, s]) => [
      toolId, { url: await presignGet(s.storage_path, 60 * 60), type: s.type },
    ] as const)
  );
  const samplesMap = new Map(sampleEntries);

  const recentUrls = await Promise.all(
    recentRows.map(async (m) => ({ ...m, url: await presignGet(m.storage_path, 60 * 60) }))
  );

  const firstName = (user.name ?? user.email ?? "").split(/[ @]/)[0] || "Creator";

  return (
    <div className="space-y-12">
      {/* ============ HERO ============ */}
      <section className="relative pt-6 pb-2">
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Welcome back, {firstName}
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
          Create cinematic AI content
          <br />
          <span className="bg-accent-grad bg-clip-text text-transparent">faster than ever.</span>
        </h1>
        <p className="text-muted mt-4 max-w-xl text-[15px] leading-relaxed">
          Один кабинет для всех нейросетей. Опиши идею — выбери модель — получи результат за секунды.
        </p>

        <div className="mt-8 max-w-3xl">
          <QuickPromptBar />
          <div className="flex items-center gap-2 mt-3 text-xs text-muted px-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border text-[10px] font-mono">Enter</kbd>
            <span>отправить</span>
            <span className="mx-1">·</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border text-[10px] font-mono">Shift + Enter</kbd>
            <span>новая строка</span>
          </div>
        </div>
      </section>

      {/* ============ TRENDING TOOLS ============ */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Trending tools</h2>
            <p className="text-xs text-muted mt-0.5">Что креаторы запускают прямо сейчас.</p>
          </div>
          <Link href="/tools" className="text-sm text-accent hover:underline">View all →</Link>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-6 md:-mx-8 px-6 md:px-8 pb-2">
          {tools.map((t) => {
            const sample = samplesMap.get(t.id);
            return (
              <Link key={t.slug} href={`/play/${t.slug}`}
                    className="group glass glass-hover w-[280px] shrink-0 overflow-hidden">
                <div className="relative aspect-[16/10] overflow-hidden">
                  {sample ? (
                    sample.type === "video" ? (
                      <video src={sample.url} muted loop preload="metadata"
                             className="w-full h-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <img src={sample.url} alt="" loading="lazy"
                           className="w-full h-full object-cover transition group-hover:scale-105" />
                    )
                  ) : (
                    <ToolCover slug={t.slug} category={t.category} name={t.name} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className="absolute top-2 left-2 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-black/50 backdrop-blur text-white/90 border border-white/10">
                    {t.category}
                  </span>
                  <span className="absolute top-2 right-2 text-[10px] font-mono px-2 py-0.5 rounded bg-accent/20 backdrop-blur text-accent border border-accent/30">
                    ✨ {t.token_cost}
                  </span>
                </div>
                <div className="p-3.5">
                  <div className="font-medium leading-tight">{t.name}</div>
                  {t.description && (
                    <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">{t.description}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ============ RECENT GENERATIONS ============ */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {isCommunity ? "Community showcase" : "Your recent work"}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {isCommunity
                ? "Свежее от других креаторов — твоё появится тут, как только запустишь генерацию."
                : "Последние генерации в одной ленте."}
            </p>
          </div>
          <Link href="/gallery" className="text-sm text-accent hover:underline">Open gallery →</Link>
        </div>
        {recentUrls.length === 0 ? (
          <EmptyShowcase />
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
            {recentUrls.map((m) => (
              <Link key={m.id} href="/gallery"
                    className="block break-inside-avoid relative group rounded-xl overflow-hidden border border-border hover:border-accent/40 transition">
                {m.type === "image" && (
                  <img src={m.url} alt="" loading="lazy"
                       className="w-full h-auto block transition group-hover:scale-[1.02]" />
                )}
                {m.type === "video" && (
                  <video src={m.url} muted preload="metadata"
                         className="w-full h-auto block" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition pointer-events-none" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* Empty state when truly nothing exists anywhere (fresh DB). */
function EmptyShowcase() {
  const tiles = [
    { c: "#7B61FF", c2: "#A855F7", icon: "🍌" },
    { c: "#FF6B9F", c2: "#5EEAD4", icon: "🎬" },
    { c: "#5EEAD4", c2: "#7B61FF", icon: "🎨" },
    { c: "#FFD93D", c2: "#FF6B9F", icon: "✨" },
    { c: "#34D399", c2: "#5EEAD4", icon: "🖼" },
    { c: "#FB923C", c2: "#A855F7", icon: "🎭" },
    { c: "#F472B6", c2: "#7B61FF", icon: "📝" },
    { c: "#60A5FA", c2: "#A855F7", icon: "🎵" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((t, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden"
               style={{ background: `linear-gradient(135deg, ${t.c} 0%, ${t.c2} 100%)` }}>
            <div className="absolute inset-0 opacity-20"
                 style={{
                   backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
                   backgroundSize: "12px 12px",
                 }} />
            <div className="absolute inset-0 grid place-items-center text-5xl"
                 style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.4))" }}>
              {t.icon}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center pt-2">
        <div className="font-display text-xl font-semibold tracking-tight mb-1">Your creative universe starts here.</div>
        <p className="text-muted text-sm">Опиши идею выше — лента заполнится твоими работами.</p>
      </div>
    </div>
  );
}
