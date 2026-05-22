import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return null;

  const jobs = await db.select({
    id: aiJobs.id, model: aiJobs.model, status: aiJobs.status,
    cost_tokens: aiJobs.costTokens, charged_tokens: aiJobs.chargedTokens,
    created_at: aiJobs.createdAt, error_message: aiJobs.errorMessage,
  })
    .from(aiJobs).where(eq(aiJobs.userId, user.id))
    .orderBy(desc(aiJobs.createdAt)).limit(50);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">История генераций</h1>
      <div className="panel divide-y divide-border text-sm">
        {jobs.length ? jobs.map((j) => (
          <div key={j.id} className="px-4 py-3 grid grid-cols-12 gap-3 items-center">
            <div className="col-span-2 font-mono text-xs text-muted">{j.id.slice(0, 8)}</div>
            <div className="col-span-4">{j.model}</div>
            <div className="col-span-2">
              <span className={`px-2 py-0.5 rounded text-xs ${badgeClass(j.status)}`}>{j.status}</span>
            </div>
            <div className="col-span-2 text-right">{j.charged_tokens ?? j.cost_tokens} ток.</div>
            <div className="col-span-2 text-right text-muted text-xs">
              {j.created_at?.toLocaleString()}
            </div>
            {j.error_message && (
              <div className="col-span-12 text-red-400 text-xs pl-[8.333%]">{j.error_message}</div>
            )}
          </div>
        )) : <div className="px-4 py-6 text-muted">Пусто.</div>}
      </div>
    </div>
  );
}

function badgeClass(status: string) {
  if (status === "completed") return "bg-green-500/20 text-green-300";
  if (status === "failed" || status === "refunded") return "bg-red-500/20 text-red-300";
  if (status === "cancelled") return "bg-muted/20 text-muted";
  return "bg-accent/20 text-accent";
}
