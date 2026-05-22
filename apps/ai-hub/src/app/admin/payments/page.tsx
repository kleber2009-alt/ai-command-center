import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PaymentRow {
  id: string; user_email: string; provider: string; status: string;
  amount_cents: number; currency: string; tokens_to_add: number;
  created_at: Date; completed_at: Date | null; provider_payment_id: string | null;
  [key: string]: unknown;
}

export default async function AdminPaymentsPage() {
  const rows = await db.execute<PaymentRow>(sql`
    select p.id, u.email as user_email, p.provider, p.status,
           p.amount_cents, p.currency, p.tokens_to_add,
           p.created_at, p.completed_at, p.provider_payment_id
      from payments p
      join users u on u.id = p.user_id
      order by p.created_at desc
      limit 100
  `);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Payments</h1>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-medium">Payment</th>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Provider</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Tokens</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="text-left px-4 py-3 font-medium">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(rows as unknown as PaymentRow[]).map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-mono text-xs">{p.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-xs">{p.user_email}</td>
                <td className="px-4 py-3 text-xs">
                  <div>{p.provider}</div>
                  {p.provider_payment_id && (
                    <div className="text-muted font-mono">{p.provider_payment_id.slice(0, 18)}…</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    p.status === "succeeded" ? "bg-green-500/20 text-green-300"
                    : p.status === "failed" || p.status === "cancelled" ? "bg-red-500/20 text-red-300"
                    : "bg-accent/20 text-accent"
                  }`}>{p.status}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  ${(p.amount_cents / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-mono">+{p.tokens_to_add.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {new Date(p.created_at as unknown as string).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {p.completed_at ? new Date(p.completed_at as unknown as string).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
