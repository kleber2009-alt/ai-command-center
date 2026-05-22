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
        <div className="grid grid-cols-2 gap-[2px] bg-border border border-border">
          <div className="bg-bg p-6">
            <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-3">balance</div>
            <div className="font-serif text-[64px] leading-none text-lime">{user.tokenBalance}</div>
            <div className="mono text-[10px] tracking-wider text-text-mute mt-2">tokens · списываются за каждую генерацию</div>
          </div>
          <div className="bg-bg p-6">
            <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-3">costs</div>
            <ul className="grid gap-1.5 font-serif text-[15px] text-text-dim">
              <li className="flex justify-between"><span>10 avatars batch</span><span className="mono text-text">-10</span></li>
              <li className="flex justify-between"><span>Carousel cover</span><span className="mono text-text">-3</span></li>
              <li className="flex justify-between"><span>Talking video</span><span className="mono text-text">-30</span></li>
              <li className="flex justify-between"><span>Voice training</span><span className="mono text-text-mute">free*</span></li>
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
                className="grid grid-cols-[80px_140px_1fr_auto_auto] gap-4 items-center px-5 py-3 border-b border-border last:border-b-0 bg-surface"
              >
                <span className={`mono text-[15px] font-bold ${t.amount > 0 ? 'text-lime' : 'text-pink'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
                <span className="mono text-[10px] tracking-widest uppercase text-text-dim">{t.type}</span>
                <span className="font-serif italic text-[14px] text-text-dim truncate">{t.reason}</span>
                <span className="mono text-[9px] tracking-wider text-text-mute">{t.refId?.slice(0, 8)}</span>
                <span className="mono text-[10px] tracking-widest text-text-mute">{formatDate(t.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
