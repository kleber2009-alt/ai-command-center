import Link from "next/link";
import { prisma } from "@/lib/db";
import { maybeUser } from "@/lib/session";
import { Card, CardTitle } from "@/components/ui/card";
import { TOKEN_COST } from "@/lib/tokens";

const PACKS = [
  { name: "Starter", tokens: 100, price: "$19" },
  { name: "Pro", tokens: 300, price: "$49" },
  { name: "Agency", tokens: 1000, price: "$99" },
];

export default async function BillingPage() {
  const user = await maybeUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <Link
          href="/api/auth/signin"
          className="mt-6 inline-flex items-center rounded-xl bg-accent px-6 h-12 text-ink-950 font-semibold"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const [me, ledger] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenBalance: true },
    }),
    prisma.tokenLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="text-ink-500 mt-1">
          You have{" "}
          <span className="font-semibold text-ink-200">
            {me?.tokenBalance ?? 0}
          </span>{" "}
          tokens.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {PACKS.map((p) => (
          <Card key={p.name}>
            <div className="text-xs uppercase tracking-wider text-ink-500">
              {p.name}
            </div>
            <div className="mt-2 text-3xl font-semibold">{p.price}</div>
            <div className="text-sm text-ink-500">{p.tokens} tokens</div>
            <form
              action="/api/billing/checkout"
              method="post"
              className="mt-5"
            >
              <input type="hidden" name="pack" value={p.name} />
              <button
                type="submit"
                disabled
                className="w-full rounded-xl bg-ink-800 text-ink-500 h-11 cursor-not-allowed"
                title="Stripe checkout — coming soon"
              >
                Buy (coming soon)
              </button>
            </form>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>Token costs</CardTitle>
        <ul className="mt-3 text-sm space-y-1 text-ink-500">
          <li>· Generate 10 avatars — {TOKEN_COST.avatarBatch} tokens</li>
          <li>· Carousel cover — {TOKEN_COST.cover} tokens</li>
        </ul>
      </Card>

      <div>
        <CardTitle className="mb-4">Recent activity</CardTitle>
        {ledger.length === 0 ? (
          <div className="text-sm text-ink-500">No transactions yet.</div>
        ) : (
          <ul className="rounded-2xl border border-white/10 bg-ink-900/60 divide-y divide-white/5">
            {ledger.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">{row.note || row.kind}</div>
                  <div className="text-xs text-ink-500">
                    {new Date(row.createdAt).toLocaleString()}
                  </div>
                </div>
                <div
                  className={
                    "font-semibold " +
                    (row.amount >= 0 ? "text-emerald-400" : "text-red-300")
                  }
                >
                  {row.amount >= 0 ? "+" : ""}
                  {row.amount}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
