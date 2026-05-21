// Wallet · billing center with luxury balance hero + tier-coloured pack tiles +
// type-coded transactions stream.

import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentPackages, tokenTransactions } from "@/lib/db/schema";
import { getWallet } from "@/lib/wallet";
import { buyPackage, buyPackageStars, applyPromoCode } from "./actions";

const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;

export const dynamic = "force-dynamic";

const TIER_PALETTE: Array<{ from: string; to: string }> = [
  { from: "#5EEAD4", to: "#60A5FA" },   // starter — mint→sky
  { from: "#7B61FF", to: "#A855F7" },   // creator — brand (recommended)
  { from: "#FB923C", to: "#FF6B9F" },   // pro — sunset
  { from: "#A855F7", to: "#FFD93D" },   // studio — galaxy
];

const TX_META: Record<string, { sign: "+" | "−"; tone: "credit" | "debit" | "neutral"; icon: string; label: string }> = {
  purchase:   { sign: "+", tone: "credit",  icon: "💳", label: "Покупка" },
  bonus:      { sign: "+", tone: "credit",  icon: "🎁", label: "Бонус" },
  adjustment: { sign: "+", tone: "credit",  icon: "✦",  label: "Корректировка" },
  refund:     { sign: "+", tone: "credit",  icon: "↺",  label: "Возврат" },
  reserve:    { sign: "−", tone: "neutral", icon: "⏳", label: "Резерв" },
  spend:      { sign: "−", tone: "debit",   icon: "✦",  label: "Списание" },
};

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string; promo?: string; n?: string }>;
}) {
  const sp = await searchParams;
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
    <div className="space-y-12">
      {/* ============ Flash banner ============ */}
      {sp.checkout === "success" && (
        <div className="glass p-4 border-green-400/30 text-green-300 text-sm flex items-center gap-3">
          <span className="text-lg">✓</span>
          <span>Оплата прошла. Токены поступят на баланс через пару секунд.</span>
        </div>
      )}
      {sp.checkout === "cancelled" && (
        <div className="glass p-4 border-red-400/30 text-red-300 text-sm flex items-center gap-3">
          <span className="text-lg">✕</span>
          <span>Оплата отменена. Платёж не списан.</span>
        </div>
      )}
      {sp.promo && (
        <PromoBanner status={sp.promo} n={sp.n} />
      )}

      {/* ============ Balance hero ============ */}
      <section>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Wallet · billing
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Баланс</h1>

        <div className="glass mt-6 p-8 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30 blur-3xl bg-accent-grad" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
            <Stat label="Доступно"      value={wallet.available}       accent big />
            <Stat label="В работе"      value={wallet.reserved}        hint={wallet.reserved > 0 ? "зарезервировано" : "—"} />
            <Stat label="Куплено всего" value={wallet.total_purchased} />
            <Stat label="Потрачено"     value={wallet.total_spent} />
          </div>
        </div>
      </section>

      {/* ============ Promo code ============ */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Промокод</h2>
            <p className="text-xs text-muted mt-0.5">Бонусные токены — один код на пользователя.</p>
          </div>
        </div>
        <form action={applyPromoCode} className="glass p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input name="code" type="text" required
                 placeholder="например WELCOME100"
                 className="input flex-1 font-mono uppercase tracking-wide" />
          <button type="submit" className="btn sm:w-auto whitespace-nowrap">
            Активировать
          </button>
        </form>
      </section>

      {/* ============ Packages ============ */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Купить токены</h2>
            <p className="text-xs text-muted mt-0.5">Без подписки. Купил пачку — генерируй когда хочешь.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {packages.map((p, idx) => {
            const palette = TIER_PALETTE[idx % TIER_PALETTE.length];
            const recommended = idx === 1;
            return (
              <div key={p.id} className={`relative glass overflow-hidden flex flex-col ${recommended ? "ring-1 ring-accent/40" : ""}`}>
                {recommended && (
                  <div className="absolute top-3 right-3 z-10 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent text-white shadow-glow">
                    popular
                  </div>
                )}
                {/* Tier accent strip */}
                <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${palette.from}, ${palette.to})` }} />
                <div className="p-5 flex flex-col flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{p.slug}</div>
                  <div className="font-display text-lg font-semibold tracking-tight mt-1">{p.name}</div>

                  <div className="mt-5">
                    <div className="font-display text-3xl font-semibold tabular-nums leading-none">
                      {(p.tokens + p.bonusTokens).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      токенов{p.bonusTokens > 0 && <span className="text-accent ml-1">+{p.bonusTokens} бонус</span>}
                    </div>
                  </div>

                  <div className="mt-6 text-lg font-medium tabular-nums">
                    ${(p.priceCents / 100).toFixed(2)}
                    <span className="text-xs text-muted ml-1">
                      / {((p.priceCents / 100) / (p.tokens + p.bonusTokens) * 100).toFixed(2)}¢ за токен
                    </span>
                  </div>

                  <div className="mt-auto pt-5 space-y-2">
                    {p.starsPrice && p.starsPrice > 0 && (
                      <form action={buyPackageStars}>
                        <input type="hidden" name="slug" value={p.slug} />
                        <button className={recommended ? "btn w-full gap-1.5" : "btn-ghost w-full gap-1.5"} type="submit">
                          <span>⭐</span>
                          <span>{p.starsPrice.toLocaleString()} Stars</span>
                        </button>
                      </form>
                    )}
                    {STRIPE_ENABLED && (
                      <form action={buyPackage}>
                        <input type="hidden" name="slug" value={p.slug} />
                        <button className="btn-ghost w-full text-sm" type="submit">
                          Pay ${(p.priceCents / 100).toFixed(2)} via Stripe
                        </button>
                      </form>
                    )}
                    {!STRIPE_ENABLED && !p.starsPrice && (
                      <div className="text-center text-xs text-muted py-2">
                        Оплата временно недоступна
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ Transactions ============ */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">История операций</h2>
            <p className="text-xs text-muted mt-0.5">Последние 30 транзакций с балансом после операции.</p>
          </div>
        </div>
        <div className="glass overflow-hidden">
          {tx.length ? (
            <div className="divide-y divide-border">
              {tx.map((t) => {
                const meta = TX_META[t.type as keyof typeof TX_META] ?? { sign: "+", tone: "neutral", icon: "•", label: t.type } as const;
                const toneColor = meta.tone === "credit" ? "text-green-400" : meta.tone === "debit" ? "text-red-400" : "text-muted";
                return (
                  <div key={t.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.03] transition">
                    <div className="w-9 h-9 rounded-lg bg-white/5 border border-border grid place-items-center text-base shrink-0">
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{meta.label}</div>
                      <div className="text-xs text-muted truncate">
                        {t.created_at?.toLocaleString("ru-RU")}
                        {t.description && <span className="ml-2 opacity-80">· {t.description}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-mono font-medium tabular-nums ${toneColor}`}>
                        {meta.sign}{Number(t.amount).toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono text-muted">
                        баланс: {Number(t.balance_after).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-muted">
              <div className="text-4xl opacity-40 mb-3">✦</div>
              <div className="text-sm">Операций пока нет.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PromoBanner({ status, n }: { status: string; n?: string }) {
  const MAP: Record<string, { tone: "ok" | "err"; text: string }> = {
    ok:        { tone: "ok",  text: n ? `Промокод применён · +${Number(n).toLocaleString()} токенов на баланс ✦` : "Промокод применён ✦" },
    already:   { tone: "err", text: "Ты уже использовал этот промокод." },
    invalid:   { tone: "err", text: "Промокод не найден или неактивен." },
    expired:   { tone: "err", text: "Срок действия промокода истёк." },
    exhausted: { tone: "err", text: "Лимит активаций этого промокода исчерпан." },
  };
  const m = MAP[status] ?? { tone: "err" as const, text: `Неизвестный статус: ${status}` };
  const cls = m.tone === "ok"
    ? "border-green-400/30 text-green-300"
    : "border-red-400/30 text-red-300";
  return (
    <div className={`glass p-4 ${cls} text-sm flex items-center gap-3`}>
      <span className="text-lg">{m.tone === "ok" ? "✓" : "!"}</span>
      <span>{m.text}</span>
    </div>
  );
}

function Stat({ label, value, accent, big, hint }: {
  label: string; value: number; accent?: boolean; big?: boolean; hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`font-display font-semibold tabular-nums leading-none mt-2 ${
        big ? "text-5xl md:text-6xl" : "text-2xl md:text-3xl"
      } ${accent ? "bg-accent-grad bg-clip-text text-transparent" : ""}`}>
        {value.toLocaleString()}
      </div>
      {hint && <div className="text-xs text-muted mt-1.5">{hint}</div>}
    </div>
  );
}
