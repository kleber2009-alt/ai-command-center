import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { BillingActions } from '@/components/billing-actions';
import { EmptyState } from '@/components/empty-state';
import { COSTS } from '@/lib/tokens';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing — Persona Studio' };

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const [recent, trialInvoice] = await Promise.all([
    prisma.tokenTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.cryptoInvoice.findFirst({
      where: { userId: user.id, pack: 'trial', status: { in: ['paid', 'active'] } },
      select: { status: true },
    }),
  ]);
  const trialUsed = Boolean(trialInvoice);

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow={`SUBSCRIPTION · PLAN ${user.plan?.toUpperCase()}`}
        title={
          <>
            Tokens fuel <span className="italic text-gold">every generation.</span>
          </>
        }
        description="Все генерации списываются с единого баланса. Пополнение — через CryptoBot (USDT) или Telegram Stars. Без подписок и автосписаний."
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">Balance</div>
            <div className="font-serif text-[44px] text-gold leading-none">{user.tokenBalance}</div>
            <div className="mono text-[9px] tracking-[0.22em] uppercase text-text-muted">tokens</div>
          </>
        }
      />

      <section>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-px bg-border-soft border border-border-soft">
          <CostCard label="Avatar batch" cost={COSTS.avatarGeneration} note="10 portraits" />
          <CostCard label="Carousel cover" cost={COSTS.coverGeneration} note="single image" />
          <CostCard label="Talking video" cost={COSTS.heygenVideo} note="up to 60s" />
          <CostCard label="Submagic edit" cost={COSTS.submagicEdit} note="Reels-ready" />
          <CostCard label="Voice training" cost={0} note="external · free" />
        </div>
      </section>

      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Купить токены</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">CryptoBot · USDT / Telegram Stars</span>
        </div>
        <BillingActions trialUsed={trialUsed} />
      </section>

      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">История транзакций</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">{recent.length} / last 30</span>
        </div>
        {recent.length === 0 ? (
          <EmptyState size="sm" title="транзакций пока нет." />
        ) : (
          <div className="border border-border">
            {recent.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[64px_1fr_auto] sm:grid-cols-[80px_140px_1fr_auto_auto] gap-x-3 gap-y-1 sm:gap-4 items-baseline sm:items-center px-4 sm:px-5 py-3 border-b border-border last:border-b-0 bg-surface"
              >
                <span className={`mono text-[15px] font-bold row-span-2 sm:row-span-1 self-center ${t.amount > 0 ? 'text-lime' : 'text-pink'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
                <span className="mono text-[9px] sm:text-[10px] tracking-widest uppercase text-text-dim order-3 sm:order-none col-start-2 sm:col-auto">{t.type}</span>
                <span className="font-serif italic text-[13px] sm:text-[14px] text-text-dim truncate min-w-0 col-start-2 sm:col-auto">{t.reason}</span>
                <span className="hidden sm:inline mono text-[9px] tracking-wider text-text-mute">{t.refId?.slice(0, 8)}</span>
                <span className="mono text-[9px] sm:text-[10px] tracking-widest text-text-mute whitespace-nowrap justify-self-end">{formatDate(t.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CostCard({ label, cost, note }: { label: string; cost: number; note: string }) {
  return (
    <div className="bg-bg-panel p-5">
      <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted mb-3">{label}</div>
      <div className="font-serif text-[28px] leading-none text-text-primary">
        {cost > 0 ? `−${cost}` : 'free'}
        {cost > 0 && <span className="mono text-[11px] text-text-muted ml-1">t</span>}
      </div>
      <div className="mono text-[9px] tracking-[0.22em] uppercase text-text-muted mt-2">{note}</div>
    </div>
  );
}
