'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ExternalLink, Star } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { errorText, exceptionText } from '@/lib/error-text';

type Method = 'cryptobot' | 'stars';

const TRIAL = {
  id: 'trial' as const,
  label: 'Trial',
  tokens: 43,
  usdt: '1.00',
  stars: 75,
  desc: '10 аватаров + обложка',
};

const PACKS = [
  { id: 'starter', label: 'Starter', tokens: 100, usdt: '9.00', stars: 650,  desc: '1 видео или ~8 батчей аватаров' },
  { id: 'pro',     label: 'Pro',     tokens: 400, usdt: '29.00', stars: 2100, desc: '~4 видео + аватары и обложки', featured: true },
  { id: 'agency',  label: 'Agency',  tokens: 1200, usdt: '79.00', stars: 5700, desc: '~12 видео — для команды' },
] as const;

type CreateResp = {
  id: string;
  invoiceId?: string;
  payUrl: string;
  tokens: number;
  asset: string;
  amount: string;
};

export function BillingActions({ trialUsed }: { trialUsed?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<CreateResp | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [inTma, setInTma] = useState(false);
  const [method, setMethod] = useState<Method>('cryptobot');

  // Detect Telegram Mini App — Stars-pay only works inside Telegram.
  useEffect(() => {
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    if (tg?.initData) {
      setInTma(true);
      setMethod('stars');
    }
  }, []);

  // Poll for balance updates while invoice is open.
  useEffect(() => {
    if (!activeInvoice) return;
    let ticks = 0;
    pollRef.current = setInterval(() => {
      ticks += 1;
      router.refresh();
      if (ticks >= 60) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setActiveInvoice(null);
      }
    }, 5_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeInvoice, router]);

  const buy = async (pack: 'trial' | (typeof PACKS)[number]['id']) => {
    setBusy(pack);
    setError(null);
    try {
      const endpoint = method === 'stars' ? '/api/billing/stars/create' : '/api/billing/cryptobot/create';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<CreateResp> & { error?: string; detail?: string; status?: string };
      if (res.status === 409 && j.error === 'trial_already_used') {
        setError(j.status === 'paid' ? 'Trial уже активирован. Дальше — Starter и выше.' : 'У тебя уже есть открытый trial-инвойс.');
        return;
      }
      if (!res.ok || !j.payUrl) {
        setError(errorText(j, res.status));
        return;
      }
      const inv = j as CreateResp;

      if (method === 'stars' && inTma && window.Telegram?.WebApp?.openInvoice) {
        // Native Telegram pay UI from inside the Mini App
        window.Telegram.WebApp.openInvoice(inv.payUrl, (status) => {
          if (status === 'paid') {
            router.refresh();
            setActiveInvoice(null);
          }
        });
        setActiveInvoice(inv);
      } else {
        window.open(inv.payUrl, '_blank', 'noopener,noreferrer');
        setActiveInvoice(inv);
      }
    } catch (e) {
      setError(exceptionText(e));
    } finally {
      setBusy(null);
    }
  };

  const priceLabel = (usdt: string, stars: number) =>
    method === 'stars'
      ? <>{stars} <Star className="inline h-[0.55em] w-[0.55em] -translate-y-[0.1em] fill-amber text-amber" aria-label="Stars" /></>
      : <>{usdt} <span className="text-[0.4em] font-semibold tracking-[0.04em] text-text-dim">USDT</span></>;

  return (
    <div className="grid gap-4">
      {/* Method toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="label">Оплата</span>
        <div className="inline-flex rounded-full border border-border-soft bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => setMethod('cryptobot')}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${method === 'cryptobot' ? 'bg-blue font-semibold text-white' : 'text-text-dim hover:text-text'}`}
          >
            CryptoBot · USDT
          </button>
          <button
            type="button"
            onClick={() => setMethod('stars')}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${method === 'stars' ? 'bg-amber font-semibold text-bg' : 'text-text-dim hover:text-text'}`}
          >
            Telegram Stars
          </button>
        </div>
        {!inTma && method === 'stars' && (
          <span className="text-[13px] text-pink fade-in">
            Stars работают только из Telegram Mini App
          </span>
        )}
      </div>

      {/* Trial card */}
      {!trialUsed && (
        <div className="panel relative overflow-hidden !border-amber/40 !bg-amber/[0.06] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 reveal">
          <div className="flex items-center gap-4">
            <Icon3D name="sparkles" size={32} tile="yellow" sway />
            <div className="grid gap-1">
              <div className="label !text-amber">TRIAL · one-time</div>
              <div className="text-[28px] font-extrabold leading-tight tabular-nums tracking-[-0.02em] text-text">
                {priceLabel(TRIAL.usdt, TRIAL.stars)}
              </div>
              <div className="text-[13.5px] text-text-dim">
                +{TRIAL.tokens} токенов = {TRIAL.desc.toLowerCase()}.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => buy('trial')}
            disabled={busy !== null || (method === 'stars' && !inTma)}
            className="btn-primary"
          >
            {busy === 'trial' ? 'Создаём…' : `Попробовать ${method === 'stars' ? `за ${TRIAL.stars} Stars` : 'за 1$'}`}
            {busy !== 'trial' && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* Main packs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {PACKS.map((p) => {
          const featured = 'featured' in p && p.featured;
          return (
          <div
            key={p.id}
            className={`card-editorial p-6 flex flex-col justify-between min-h-[240px] ${
              featured ? '!border-gold/50 !bg-blue/[0.07] shadow-glow' : ''
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="flex items-center gap-2.5 text-[20px] font-semibold tracking-[-0.02em] text-text">
                  <Icon3D name={p.id === 'starter' ? 'coin' : p.id === 'pro' ? 'bolt' : 'package'} size={24} tile />
                  {p.label}
                </span>
                {featured && (
                  <span className="rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-bg">recommended</span>
                )}
              </div>
              <div className="text-[44px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-text mb-1">
                {priceLabel(p.usdt, p.stars)}
              </div>
              <div className="mt-2.5 text-[13px] font-semibold tabular-nums text-gold">
                +{p.tokens} токенов
              </div>
              <div className="text-[13.5px] text-text-dim mt-1.5">{p.desc}</div>
            </div>
            <button
              type="button"
              onClick={() => buy(p.id)}
              disabled={busy !== null || (method === 'stars' && !inTma)}
              className={`mt-6 w-full ${featured ? 'btn-primary' : 'btn-ghost'}`}
            >
              {busy === p.id ? 'Создаём…' : `Купить · +${p.tokens}t`}
              {busy !== p.id && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
          );
        })}
      </div>

      {activeInvoice && (
        <div className="panel !border-lime/40 !bg-lime/[0.05] p-5 flex flex-wrap items-center justify-between gap-3 pop-in">
          <div className="flex items-center gap-3.5">
            <Icon3D name="processing" size={28} tile="lime" sway />
            <div>
              <div className="label !text-lime mb-1">
                waiting
              </div>
              <div className="text-[14.5px] text-text">
                Инвойс {activeInvoice.amount} {activeInvoice.asset === 'XTR' ? '★' : activeInvoice.asset} открыт.
                После оплаты {activeInvoice.tokens} токенов зачислятся автоматически.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!inTma && (
              <a href={activeInvoice.payUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                Открыть снова
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button type="button" className="btn-ghost" onClick={() => setActiveInvoice(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-3 text-[13px] text-pink fade-in">
          {error}
        </div>
      )}

      <p className="text-[12.5px] text-text-mute">
        {method === 'stars' ? (
          <>Оплата Telegram Stars · мгновенное зачисление через бот-webhook</>
        ) : (
          <>Оплата через <a href="https://t.me/CryptoBot" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">@CryptoBot</a> · USDT/TON/BTC · авто-зачисление в течение ~30 сек</>
        )}
      </p>
    </div>
  );
}
