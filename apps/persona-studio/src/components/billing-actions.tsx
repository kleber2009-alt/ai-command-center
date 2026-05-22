'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const PACKS = [
  { id: 'starter', label: 'Starter', tokens: 100, usdt: '9.00', desc: '~10 батчей аватаров или 33 обложки' },
  { id: 'pro', label: 'Pro', tokens: 400, usdt: '29.00', desc: '~13 видео + батчи аватаров', featured: true },
  { id: 'agency', label: 'Agency', tokens: 1200, usdt: '79.00', desc: 'безлимит на месяц для команды' },
] as const;

type CreateResp = {
  id: string;
  invoiceId: string;
  payUrl: string;
  tokens: number;
  asset: string;
  amount: string;
};

export function BillingActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<CreateResp | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // После открытия инвойса опрашиваем балланс — при оплате CryptoBot вызовет
  // webhook, токены зачислятся, и refresh подтянет новый баланс.
  useEffect(() => {
    if (!activeInvoice) return;
    let ticks = 0;
    pollRef.current = setInterval(() => {
      ticks += 1;
      router.refresh();
      if (ticks >= 60) {                          // 60 × 5s = 5 минут
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

  const buy = async (pack: (typeof PACKS)[number]['id']) => {
    setBusy(pack);
    setError(null);
    try {
      const res = await fetch('/api/billing/cryptobot/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<CreateResp> & { error?: string; detail?: string };
      if (!res.ok || !j.payUrl) {
        setError(j.detail ?? j.error ?? `http_${res.status}`);
        return;
      }
      const inv = j as CreateResp;
      window.open(inv.payUrl, '_blank', 'noopener,noreferrer');
      setActiveInvoice(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid md:grid-cols-3 gap-[2px] bg-border border border-border">
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
                {p.usdt} <span className="mono text-[12px] tracking-wider text-text-dim uppercase">USDT</span>
              </div>
              <div className="mono text-[10px] tracking-widest text-text-mute uppercase mt-2">
                +{p.tokens} токенов
              </div>
              <div className="font-serif italic text-[13px] text-text-dim mt-2">{p.desc}</div>
            </div>
            <button
              onClick={() => buy(p.id)}
              disabled={busy !== null}
              className={`mt-5 justify-center ${
                'featured' in p && p.featured ? 'btn-primary' : 'btn-ghost'
              }`}
            >
              {busy === p.id ? 'Создаём инвойс…' : `Купить · +${p.tokens}t →`}
            </button>
          </div>
        ))}
      </div>

      {activeInvoice && (
        <div className="border border-lime/40 bg-[#0a1305] p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mono text-[10px] tracking-widest uppercase text-lime mb-1">
              / waiting · invoice {activeInvoice.invoiceId}
            </div>
            <div className="font-serif italic text-[15px]">
              Инвойс {activeInvoice.amount} {activeInvoice.asset} открыт в новой вкладке. После оплаты {activeInvoice.tokens} токенов зачислятся автоматически.
            </div>
          </div>
          <div className="flex gap-2">
            <a href={activeInvoice.payUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              Открыть снова →
            </a>
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
        Оплата через <a href="https://t.me/CryptoBot" target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">@CryptoBot</a> в Telegram · USDT, TON, BTC. Зачисление автоматическое, в течение ~30 секунд после оплаты.
      </p>
    </div>
  );
}
