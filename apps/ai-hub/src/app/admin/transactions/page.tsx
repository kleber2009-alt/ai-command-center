// /admin/transactions · полный ledger token_transactions для аудита.
// 7 типов: purchase / spend / refund / bonus / reserve / release / adjustment.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TxRow {
  id: string; user_email: string; type: string;
  amount: number; balance_after: number;
  description: string | null; job_id: string | null;
  metadata: Record<string, unknown> | null; created_at: Date;
  [key: string]: unknown;
}

const TYPE_FILTERS = ["all","purchase","spend","refund","bonus","reserve","release","adjustment"] as const;

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: { type?: string; user?: string };
}) {
  const type = searchParams.type;
  const userFilter = searchParams.user;

  const where = sql`where 1=1`
    .append(type && type !== "all" ? sql` and t.type = ${type}` : sql``)
    .append(userFilter ? sql` and u.email ilike ${"%" + userFilter + "%"}` : sql``);

  const rows = await db.execute<TxRow>(sql`
    select t.id, u.email as user_email, t.type, t.amount, t.balance_after,
           t.description, t.job_id, t.metadata, t.created_at
      from token_transactions t
      join users u on u.id = t.user_id
      ${where}
      order by t.created_at desc
      limit 200
  `);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Transactions</h1>
      <p className="text-muted text-sm">
        Полный append-only ledger всех движений токенов. 200 свежих записей.
      </p>

      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {TYPE_FILTERS.map((f) => {
          const active = (f === "all" && !type) || f === type;
          const params = new URLSearchParams();
          if (f !== "all") params.set("type", f);
          if (userFilter) params.set("user", userFilter);
          const href = params.toString() ? `/admin/transactions?${params}` : "/admin/transactions";
          return (
            <a key={f} href={href}
               className={`px-3 py-1.5 rounded-md ${active ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-text"}`}>
              {f}
            </a>
          );
        })}
      </div>

      <form className="flex gap-2 max-w-md">
        <input
          name="user" type="text" placeholder="filter by user email…"
          defaultValue={userFilter ?? ""}
          className="input flex-1"
        />
        {type && type !== "all" && <input type="hidden" name="type" value={type} />}
        <button type="submit" className="btn-ghost px-4">Search</button>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="text-left  px-4 py-3 font-medium">Tx</th>
              <th className="text-left  px-4 py-3 font-medium">User</th>
              <th className="text-left  px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Balance after</th>
              <th className="text-left  px-4 py-3 font-medium">Description</th>
              <th className="text-left  px-4 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(rows as unknown as TxRow[]).map((t) => {
              const isDebit = t.type === "spend" || t.type === "reserve";
              return (
                <tr key={t.id} className="hover:bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs">{t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-xs">{t.user_email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${typeBadge(t.type)}`}>{t.type}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${isDebit ? "text-red-400" : "text-green-400"}`}>
                    {isDebit ? "−" : "+"}{Number(t.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {Number(t.balance_after).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted max-w-[280px] truncate">
                    {t.description ?? "—"}
                    {t.job_id && (
                      <a href={`/admin/jobs`} className="ml-2 text-accent font-mono">
                        job {t.job_id.slice(0, 8)}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {new Date(t.created_at as unknown as string).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function typeBadge(type: string): string {
  switch (type) {
    case "purchase":   return "bg-green-500/20 text-green-300";
    case "bonus":      return "bg-accent/20 text-accent";
    case "spend":      return "bg-red-500/15 text-red-300";
    case "refund":     return "bg-green-500/15 text-green-300";
    case "reserve":    return "bg-orange-500/15 text-orange-300";
    case "release":    return "bg-orange-500/10 text-muted";
    case "adjustment": return "bg-accent/15 text-accent";
    default:           return "bg-muted/20 text-muted";
  }
}
