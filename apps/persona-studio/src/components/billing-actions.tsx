'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

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
        setError(j.detail ?? j.error ?? `http_${res.status}`);
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const priceLabel = (usdt: string, stars: number) =>
    method === 'stars'
      ? <>{stars} <span className="mono text-[12px] tracking-wider text-text-dim uppercase">★</span></>
      : <>{usdt} <span className="mono text-[12px] tracking-wider text-text-dim uppercase">USDT</span></>;

  return (
    <div className="grid gap-4">
      {/* Method toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="mono text-[10px] tracking-widest uppercase text-text-mute">Оплата</span>
        <div className="inline-flex border border-border">
          <button
            type="button"
            onClick={() => setMethod('cryptobot')}
            className={`mono text-[11px] tracking-widest uppercase px-3 py-1.5 ${method === 'cryptobot' ? 'bg-lime text-bg' : 'text-text-dim hover:text-text'}`}
          >
            CryptoBot · USDT
          </button>
          <button
            type="button"
            onClick={() => setMethod('stars')}
            className={`mono text-[11px] tracking-widest uppercase px-3 py-1.5 border-l border-border ${method === 'stars' ? 'bg-warm text-bg' : 'text-text-dim hover:text-text'}`}
          >
            Telegram Stars
          </button>
        </div>
        {!inTma && method === 'stars' && (
          <span className="mono text-[10px] text-pink tracking-wider">
            Stars работают только из Telegram Mini App
          </span>
        )}
      </div>

      {/* Trial card */}
      {!trialUsed && (
        <div className="border-2 border-warm bg-[#1a0f05] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <div className="mono text-[10px] tracking-widest uppercase text-warm">/ TRIAL · one-time</div>
            <div className="font-serif italic text-[24px] leading-tight">
              {priceLabel(TRIAL.usdt, TRIAL.stars)}
            </div>
            <div className="font-serif italic text-[13px] text-text-dim">
              +{TRIAL.tokens} токенов = {TRIAL.desc.toLowerCase()}.
            </div>
          </div>
          <button
            onClick={() => buy('trial')}
            disabled={busy !== null || (method === 'stars' && !inTma)}
            className="btn-primary whitespace-nowrap"
          >
            {busy === 'trial' ? 'Создаём…' : `Попробовать ${method === 'stars' ? `за ${TRIAL.stars}★` : 'за 1$'} →`}
          </button>
        </div>
      )}

      {/* Main packs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-[2px] bg-border border border-border">
        {PACKS.map((p) => (
          <div
            key={p.id}
            className={`bg-surface p-6 flex flex-col justify-between min-h-[220px] ${
              'featured' in p && p.featured ? 'border-l-2 border-lime' : ''
            }`}
          >
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="font-serif italic text-[22px]">{p.label}</span>
                {'featured' in p && p.featured && (
                  <span className="mono text-[9px] tracking-widest uppercase text-lime font-bold">recommended</span>
                )}
              </div>
              <div className="font-serif text-[42px] leading-none mb-1">
                {priceLabel(p.usdt, p.stars)}
              </div>
              <div className="mono text-[10px] tracking-widest text-text-mute uppercase mt-2">
                +{p.tokens} токенов
              </div>
              <div className="font-serif italic text-[13px] text-text-dim mt-2">{p.desc}</div>
            </div>
            <button
              onClick={() => buy(p.id)}
              disabled={busy !== null || (method === 'stars' && !inTma)}
              className={`mt-5 justify-center ${
                'featured' in p && p.featured ? 'btn-primary' : 'btn-ghost'
              }`}
            >
              {busy === p.id ? 'Создаём…' : `Купить · +${p.tokens}t →`}
            </button>
          </div>
        ))}
      </div>

      {activeInvoice && (
        <div className="border border-lime/40 bg-[#0a1305] p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mono text-[10px] tracking-widest uppercase text-lime mb-1">
              / waiting
            </div>
            <div className="font-serif italic text-[15px]">
              Инвойс {activeInvoice.amount} {activeInvoice.asset === 'XTR' ? '★' : activeInvoice.asset} открыт.
              После оплаты {activeInvoice.tokens} токенов зачислятся автоматически.
            </div>
          </div>
          <div className="flex gap-2">
            {!inTma && (
              <a href={activeInvoice.payUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                Открыть снова →
              </a>
            )}
            <button type="button" className="btn-ghost" onClick={() => setActiveInvoice(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-pink/40 bg-[#1a0510] p-4">
          <span className="mono text-[11px] text-pink tracking-wider">/ERROR — {error}</span>
        </div>
      )}

      <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
        {method === 'stars' ? (
          <>Оплата Telegram Stars · мгновенное зачисление через бот-webhook</>
        ) : (
          <>Оплата через <a href="https://t.me/CryptoBot" target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">@CryptoBot</a> · USDT/TON/BTC · авто-зачисление в течение ~30 сек</>
        )}
      </p>
    </div>
  );
}
