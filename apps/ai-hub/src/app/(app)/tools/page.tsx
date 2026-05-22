import Link from "next/link";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTools } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { id: "image", label: "Изображения" },
  { id: "video", label: "Видео" },
  { id: "face", label: "Face" },
  { id: "audio", label: "Аудио" },
  { id: "content", label: "Контент" },
  { id: "analysis", label: "Анализ" },
] as const;

export default async function ToolsPage() {
  const tools = await db.select({
    slug: aiTools.slug, name: aiTools.name, description: aiTools.description,
    category: aiTools.category, token_cost: aiTools.tokenCost, status: aiTools.status,
  })
    .from(aiTools).where(inArray(aiTools.status, ["active", "beta"]))
    .orderBy(asc(aiTools.sortOrder));

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Каталог инструментов</h1>
      {CATEGORIES.map((cat) => {
        const items = tools.filter((t) => t.category === cat.id);
        if (!items.length) return null;
        return (
          <section key={cat.id}>
            <h2 className="text-xl font-medium mb-3">{cat.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((t) => (
                <Link key={t.slug} href={`/tools/${t.slug}`}
                      className="panel p-5 hover:border-accent transition">
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-sm text-muted">{t.token_cost} ток.</div>
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted mt-2 line-clamp-2">{t.description}</p>
                  )}
                  {t.status === "beta" && (
                    <span className="inline-block mt-3 px-2 py-0.5 rounded text-xs bg-accent/20 text-accent">beta</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
