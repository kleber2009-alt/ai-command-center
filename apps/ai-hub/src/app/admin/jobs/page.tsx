import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { RefundButton } from "./RefundButton";

export const dynamic = "force-dynamic";

interface JobRow {
  id: string; user_email: string; tool_slug: string; provider: string;
  status: string; cost_tokens: number; charged_tokens: number | null;
  created_at: Date; error_message: string | null;
  [key: string]: unknown;
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status;
  const where = status ? sql`where j.status = ${status}` : sql``;

  const rows = await db.execute<JobRow>(sql`
    select j.id, u.email as user_email, t.slug as tool_slug, j.provider,
           j.status, j.cost_tokens, j.charged_tokens, j.created_at, j.error_message
      from ai_jobs j
      join users u on u.id = j.user_id
      join ai_tools t on t.id = j.tool_id
      ${where}
      order by j.created_at desc
      limit 100
  `);

  const filters = ["all","queued","processing","completed","failed","refunded","cancelled"];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Jobs</h1>

      <div className="flex gap-2 text-xs font-mono">
        {filters.map((f) => {
          const active = (f === "all" && !status) || f === status;
          const href = f === "all" ? "/admin/jobs" : `/admin/jobs?status=${f}`;
          return (
            <a key={f} href={href}
               className={`px-3 py-1.5 rounded-md ${active ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"}`}>
              {f}
            </a>
          );
        })}
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-medium">Job</th>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Tool</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Cost</th>
              <th className="text-right px-4 py-3 font-medium">Charged</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(rows as unknown as JobRow[]).map((j) => (
              <tr key={j.id} className="hover:bg-bg/50">
                <td className="px-4 py-3 font-mono text-xs">{j.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-xs">{j.user_email}</td>
                <td className="px-4 py-3"><div>{j.tool_slug}</div><div className="text-xs text-muted">{j.provider}</div></td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${badgeClass(j.status)}`}>{j.status}</span>
                  {j.error_message && <div className="text-xs text-red-400 mt-1">{j.error_message.slice(0, 60)}</div>}
                </td>
                <td className="px-4 py-3 text-right font-mono">{j.cost_tokens}</td>
                <td className="px-4 py-3 text-right font-mono text-muted">{j.charged_tokens ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {new Date(j.created_at as unknown as string).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {j.status === "completed" || j.status === "failed" ? (
                    <RefundButton jobId={j.id} amount={j.charged_tokens ?? j.cost_tokens} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
