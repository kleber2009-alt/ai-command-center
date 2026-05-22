// /admin · Overview: high-level metrics across the platform.

import { count, eq, gt, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, aiJobs, tokenWallets, tokenTransactions, payments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [usersTotal, walletsTotals, jobs24h, jobsFailed24h, paymentsTotals, tokensSpent] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({
      available: sum(tokenWallets.available),
      reserved:  sum(tokenWallets.reserved),
      purchased: sum(tokenWallets.totalPurchased),
      spent:     sum(tokenWallets.totalSpent),
    }).from(tokenWallets),
    db.select({ n: count() }).from(aiJobs).where(gt(aiJobs.createdAt, since24h)),
    db.select({ n: count() }).from(aiJobs)
      .where(sql`status in ('failed','refunded') and created_at > ${since24h}`),
    db.select({
      n: count(),
      gmv: sum(payments.amountCents),
    }).from(payments).where(eq(payments.status, "succeeded")),
    db.select({ total: sum(tokenTransactions.amount) })
      .from(tokenTransactions)
      .where(sql`type = 'spend' and created_at > ${since24h}`),
  ]);

  const w = walletsTotals[0];
  const p = paymentsTotals[0];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Admin overview</h1>

      <section>
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted mb-3">Users · Wallets</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Users" value={Number(usersTotal[0]?.n ?? 0)} />
          <Card label="Tokens available" value={Number(w?.available ?? 0)} />
          <Card label="Tokens reserved" value={Number(w?.reserved ?? 0)} muted />
          <Card label="Lifetime purchased" value={Number(w?.purchased ?? 0)} muted />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted mb-3">Last 24h</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Jobs total" value={Number(jobs24h[0]?.n ?? 0)} />
          <Card label="Jobs failed/refunded" value={Number(jobsFailed24h[0]?.n ?? 0)} muted />
          <Card label="Tokens spent" value={Number(tokensSpent[0]?.total ?? 0)} />
          <Card label="Lifetime spent" value={Number(w?.spent ?? 0)} muted />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted mb-3">Revenue</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Payments succeeded" value={Number(p?.n ?? 0)} />
          <Card
            label="GMV (USD)"
            value={`$${(Number(p?.gmv ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            accent
          />
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, accent, muted }: {
  label: string; value: string | number;
  accent?: boolean; muted?: boolean;
}) {
  return (
    <div className="panel p-5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-semibold mt-2 ${accent ? "text-accent" : muted ? "text-muted" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
