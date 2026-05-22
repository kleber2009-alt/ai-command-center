import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, tokenWallets, aiJobs } from "@/lib/db/schema";
import { GrantTokens } from "./GrantTokens";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // Single query: users LEFT JOIN wallets + count of jobs per user.
  const rows = await db.execute<{
    id: string; email: string; name: string | null; role: string;
    created_at: Date; available: number | null; reserved: number | null;
    total_spent: number | null; jobs_count: number;
  }>(sql`
    select u.id, u.email, u.name, u.role, u.created_at,
           w.available, w.reserved, w.total_spent,
           (select count(*) from ai_jobs j where j.user_id = u.id) as jobs_count
      from users u
      left join token_wallets w on w.user_id = u.id
      order by u.created_at desc
      limit 100
  `);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Users</h1>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-right px-4 py-3 font-medium">Available</th>
              <th className="text-right px-4 py-3 font-medium">Reserved</th>
              <th className="text-right px-4 py-3 font-medium">Spent</th>
              <th className="text-right px-4 py-3 font-medium">Jobs</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(rows as unknown as Array<Record<string, unknown>>).map((u) => (
              <tr key={u.id as string} className="hover:bg-bg/50">
                <td className="px-4 py-3">
                  <div>{u.email as string}</div>
                  {typeof u.name === "string" && u.name.length > 0 && (
                    <div className="text-xs text-muted">{u.name}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.role === "admin" ? "bg-accent/20 text-accent" : "bg-muted/10 text-muted"}`}>
                    {u.role as string}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{Number(u.available ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono text-muted">{Number(u.reserved ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono text-muted">{Number(u.total_spent ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{Number(u.jobs_count ?? 0)}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {new Date(u.created_at as string).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <GrantTokens userId={u.id as string} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
