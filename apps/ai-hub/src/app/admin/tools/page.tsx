import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTools } from "@/lib/db/schema";
import { ToolControls } from "./ToolControls";

export const dynamic = "force-dynamic";

export default async function AdminToolsPage() {
  const tools = await db.select().from(aiTools).orderBy(asc(aiTools.sortOrder));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Tools</h1>
      <p className="text-muted text-sm">
        Управление каталогом без правки seed-SQL. Изменения применяются мгновенно (revalidate=60 на /tools).
      </p>

      <div className="glass overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-medium">Tool</th>
              <th className="text-left px-4 py-3 font-medium">Provider</th>
              <th className="text-left px-4 py-3 font-medium">Model</th>
              <th className="text-right px-4 py-3 font-medium">Cost</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tools.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted">{t.slug} · {t.category}</div>
                </td>
                <td className="px-4 py-3 text-xs">{t.provider}</td>
                <td className="px-4 py-3 text-xs font-mono text-muted">{t.model}</td>
                <td className="px-4 py-3 text-right font-mono">{t.tokenCost}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    t.status === "active" ? "bg-green-500/20 text-green-300"
                    : t.status === "beta" ? "bg-accent/20 text-accent"
                    : "bg-muted/20 text-muted"
                  }`}>{t.status}</span>
                </td>
                <td className="px-4 py-3"><ToolControls toolId={t.id} status={t.status} cost={t.tokenCost} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
