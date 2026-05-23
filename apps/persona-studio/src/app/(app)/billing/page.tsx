import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { BillingActions } from '@/components/billing-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing — Persona Studio' };

export default async function BillingPage() {
  const user = (await getCurrentUser())!;

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
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Billing</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">plan: {user.plan}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[2px] bg-border border border-border">
          <div className="bg-bg p-5 sm:p-6">
            <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-3">balance</div>
            <div className="font-serif text-[48px] sm:text-[64px] leading-none text-lime break-words">{user.tokenBalance}</div>
            <div className="mono text-[10px] tracking-wider text-text-mute mt-2">tokens · списываются за каждую генерацию</div>
          </div>
          <div className="bg-bg p-5 sm:p-6">
            <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-3">costs</div>
            <ul className="grid gap-1.5 font-serif text-[14px] sm:text-[15px] text-text-dim">
              <li className="flex justify-between gap-3"><span>10 avatars batch</span><span className="mono text-text shrink-0">-10</span></li>
              <li className="flex justify-between gap-3"><span>Carousel cover</span><span className="mono text-text shrink-0">-3</span></li>
              <li className="flex justify-between gap-3"><span>Talking video</span><span className="mono text-text shrink-0">-30</span></li>
              <li className="flex justify-between gap-3"><span>Voice training</span><span className="mono text-text-mute shrink-0">free*</span></li>
            </ul>
          </div>
        </div>
      </header>

      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Купить токены</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">CryptoBot · USDT</span>
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
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">/EMPTY</p>
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
