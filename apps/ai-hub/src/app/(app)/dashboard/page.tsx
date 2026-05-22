import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiTools, aiJobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return null;

  const [tools, jobs] = await Promise.all([
    db.select({ slug: aiTools.slug, name: aiTools.name, category: aiTools.category, token_cost: aiTools.tokenCost })
      .from(aiTools).where(inArray(aiTools.status, ["active", "beta"]))
      .orderBy(asc(aiTools.sortOrder)).limit(8),
    db.select({
      id: aiJobs.id, status: aiJobs.status, model: aiJobs.model,
      created_at: aiJobs.createdAt, cost_tokens: aiJobs.costTokens,
    }).from(aiJobs).where(eq(aiJobs.userId, user.id))
      .orderBy(desc(aiJobs.createdAt)).limit(5),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-semibold">С возвращением.</h1>
        <p className="text-muted mt-2">Выбери инструмент и начни творить.</p>
      </section>

      {/* ===== Featured · Nano Banana 2 ===== */}
      <section>
        <a href="/play/nano-banana-2" target="_blank" rel="noopener"
           className="block rounded-2xl overflow-hidden relative group border border-border"
           style={{
             background: "linear-gradient(135deg, #FFE16A 0%, #FF8C42 50%, #E0457B 100%)",
           }}>
          <div className="absolute inset-0" style={{
            background: "radial-gradient(circle at 70% 20%, rgba(255,255,255,.25), transparent 50%)",
          }} />
          <div className="relative p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="text-6xl md:text-7xl drop-shadow-lg">🍌</div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur text-white text-[10px] font-mono uppercase tracking-wider mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                New · Featured
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Nano Banana 2</h2>
              <p className="text-white/90 mt-2 text-sm md:text-base max-w-xl">
                Google Gemini 2.5 Flash Image. Премиум-редактирование с сохранением лица и композиции.
                До 14 input-изображений за один запрос.
              </p>
              <div className="flex items-center gap-4 mt-4 text-white/90 text-xs font-mono">
                <span>12 токенов</span>
                <span>·</span>
                <span>via kie.ai</span>
                <span>·</span>
                <span>1K / 2K / 4K</span>
              </div>
            </div>
            <div className="md:ml-auto">
              <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-black font-semibold text-sm group-hover:scale-105 transition">
                Открыть playground
                <span className="text-base">↗</span>
              </div>
            </div>
          </div>
        </a>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-medium">Инструменты</h2>
          <Link href="/tools" className="text-sm text-accent">Все →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {tools.map((t) => (
            <Link key={t.slug} href={`/tools/${t.slug}`} className="panel p-4 hover:border-accent transition">
              <div className="text-sm text-muted uppercase tracking-wider">{t.category}</div>
              <div className="font-medium mt-1">{t.name}</div>
              <div className="text-sm text-muted mt-3">{t.token_cost} токенов</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-medium">Последние генерации</h2>
          <Link href="/history" className="text-sm text-accent">История →</Link>
        </div>
        {jobs.length > 0 ? (
          <div className="panel divide-y divide-border">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-mono text-xs text-muted">{j.id.slice(0, 8)}</div>
                  <div>{j.model}</div>
                </div>
                <div className="text-muted">{j.status}</div>
                <div className="text-right">{j.cost_tokens} ток.</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel p-6 text-muted text-sm">
            Пока пусто. <Link href="/tools" className="text-accent">Создай первую генерацию.</Link>
          </div>
        )}
      </section>
    </div>
  );
}
