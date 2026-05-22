import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentPackages, tokenTransactions } from "@/lib/db/schema";
import { getWallet } from "@/lib/wallet";
import { buyPackage } from "./actions";

export const dynamic = "force-dynamic";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: { checkout?: string; session_id?: string };
}) {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return null;

  const [wallet, packages, tx] = await Promise.all([
    getWallet(user.id),
    db.select().from(paymentPackages).where(eq(paymentPackages.isActive, true)).orderBy(asc(paymentPackages.sortOrder)),
    db.select({
      id: tokenTransactions.id, type: tokenTransactions.type,
      amount: tokenTransactions.amount, balance_after: tokenTransactions.balanceAfter,
      description: tokenTransactions.description, created_at: tokenTransactions.createdAt,
    }).from(tokenTransactions).where(eq(tokenTransactions.userId, user.id))
      .orderBy(desc(tokenTransactions.createdAt)).limit(30),
  ]);

  return (
    <div className="space-y-10">
      {searchParams.checkout === "success" && (
        <div className="panel p-4 border-green-500/40 bg-green-500/5 text-green-300 text-sm">
          Оплата прошла. Токены поступят на баланс в течение пары секунд (Stripe webhook → wallet_credit).
        </div>
      )}
      {searchParams.checkout === "cancelled" && (
        <div className="panel p-4 border-red-500/40 bg-red-500/5 text-red-300 text-sm">
          Оплата отменена. Платёж не списан.
        </div>
      )}

      <section>
        <h1 className="text-3xl font-semibold">Баланс</h1>
        <div className="panel p-6 mt-4 flex flex-wrap gap-8">
          <Stat label="Доступно" value={wallet.available} accent />
          <Stat label="В работе" value={wallet.reserved} />
          <Stat label="Куплено всего" value={wallet.total_purchased} />
          <Stat label="Потрачено" value={wallet.total_spent} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-3">Купить токены</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {packages.map((p) => (
            <div key={p.id} className="panel p-5 flex flex-col">
              <div className="font-medium">{p.name}</div>
              <div className="text-3xl font-semibold mt-2">{(p.tokens + p.bonusTokens).toLocaleString()}</div>
              <div className="text-sm text-muted">токенов{p.bonusTokens > 0 && ` (+${p.bonusTokens} бонус)`}</div>
              <div className="mt-4 text-lg">${(p.priceCents / 100).toFixed(2)}</div>
              <form action={buyPackage} className="mt-auto pt-4">
                <input type="hidden" name="slug" value={p.slug} />
                <button className="btn w-full" type="submit">Купить</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-3">История операций</h2>
        <div className="panel divide-y divide-border text-sm">
          {tx.length ? tx.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium capitalize">{t.type}</div>
                <div className="text-muted text-xs">{t.created_at?.toLocaleString()}</div>
                {t.description && <div className="text-muted text-xs">{t.description}</div>}
              </div>
              <div className={`font-mono ${t.type === "spend" || t.type === "reserve" ? "text-red-400" : "text-green-400"}`}>
                {t.type === "spend" || t.type === "reserve" ? "−" : "+"}{t.amount}
              </div>
            </div>
          )) : <div className="px-4 py-6 text-muted">Операций пока нет.</div>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${accent ? "text-accent" : ""}`}>{value.toLocaleString()}</div>
    </div>
  );
}
