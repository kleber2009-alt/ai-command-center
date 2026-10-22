import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { BillingActions } from '@/components/billing-actions';
import { EmptyState } from '@/components/empty-state';
import { COSTS } from '@/lib/tokens';
import { engineConfig } from '@/lib/video-engines';
import { defaultEngine } from '@/lib/studio/produce';
import { PageHero } from '@/components/shell/page-hero';
import { Icon3D } from '@/components/ui/icon3d';
import { reasonLabel, txTypeLabel } from '@/lib/token-reasons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Оплата — Persona Studio' };

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
        icon="billing"
        eyebrow={`баланс · план ${user.plan ?? "free"}`}
        title={
          <>
            Токены — <span className="italic text-gold">топливо каждой генерации.</span>
          </>
        }
        description="Все генерации списываются с единого баланса. Пополнение — через CryptoBot (USDT) или Telegram Stars. Без подписок и автосписаний."
        meta={
          <>
            <div className="label">Баланс</div>
            <div className="text-[48px] font-extrabold tabular-nums tracking-[-0.03em] text-gold leading-none">{user.tokenBalance}</div>
            <div className="label">токенов</div>
          </>
        }
      />

      <section>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 stagger">
          <CostCard label="Сценарий" cost={COSTS.studioScript} note="бриф → сценарий" />
          <CostCard label="Пакет аватаров" cost={COSTS.avatarGeneration} note="10 портретов" />
          <CostCard label="Обложка" cost={COSTS.coverGeneration} note="одно изображение" />
          <CostCard label="Говорящее видео" cost={engineConfig(defaultEngine()).cost} note="аватар + голос" />
          <CostCard label="Монтаж по скиллу" cost={COSTS.skillMontage} note="паузы · титры · панчи" />
          <CostCard label="AI-картинка слайда" cost={COSTS.slideImage} note="за слайд карусели" />
          <CostCard label="Клон голоса" cost={0} note="бесплатно" />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="sec-num">/01</span>
          <span className="sec-title">Купить токены</span>
          <span className="flex-1 h-px bg-border-soft" />
          <span className="eyebrow !py-1">CryptoBot · USDT / Telegram Stars</span>
        </div>
        <BillingActions trialUsed={trialUsed} />
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="sec-num">/02</span>
          <span className="sec-title">История транзакций</span>
          <span className="flex-1 h-px bg-border-soft" />
          <span className="text-[12px] tabular-nums text-text-mute">{recent.length} из последних 30</span>
        </div>
        {recent.length === 0 ? (
          <EmptyState size="sm" title="транзакций пока нет." />
        ) : (
          <div className="panel overflow-hidden">
            {recent.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[64px_1fr_auto] sm:grid-cols-[80px_140px_1fr_auto_auto] gap-x-3 gap-y-1 sm:gap-4 items-baseline sm:items-center px-4 sm:px-5 py-3 border-b border-border-soft last:border-b-0 transition-colors hover:bg-white/[0.03]"
              >
                <span className={`text-[15px] font-bold tabular-nums row-span-2 sm:row-span-1 self-center ${t.amount > 0 ? 'text-lime' : 'text-pink'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
                <span className="justify-self-start rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-text-dim order-3 sm:order-none col-start-2 sm:col-auto">{txTypeLabel(t.type)}</span>
                <span className="text-[13px] sm:text-[14px] text-text-dim truncate min-w-0 col-start-2 sm:col-auto">{reasonLabel(t.reason)}</span>
                <span className="hidden sm:inline font-mono text-[11px] text-text-mute">{t.refId?.slice(0, 8)}</span>
                <span className="text-[12px] tabular-nums text-text-mute whitespace-nowrap justify-self-end">{formatDate(t.createdAt)}</span>
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
    <div className="panel p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        <Icon3D name="coin" size={18} className="flex-none" />
      </div>
      <div className="text-[28px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-text">
        {cost > 0 ? `−${cost}` : '0'}
        <span className="ml-1 text-[12px] font-medium text-text-mute">ток.</span>
      </div>
      <div className="mt-2 text-[12px] text-text-mute">{note}</div>
    </div>
  );
}
