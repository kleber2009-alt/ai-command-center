'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PACKS = [
  { id: 'starter', label: 'Starter', tokens: 100, usd: 19, desc: '50 covers · 10 avatar batches' },
  { id: 'pro', label: 'Pro', tokens: 400, usd: 49, desc: '+ HeyGen video · priority queue', featured: true },
  { id: 'agency', label: 'Agency', tokens: 1200, usd: 99, desc: 'Brand kits · team · white label' },
] as const;

export function BillingActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (pack: (typeof PACKS)[number]['id']) => {
    setBusy(pack);
    setError(null);
    try {
      const res = await fetch('/api/billing/buy-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `http_${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid md:grid-cols-3 gap-[2px] bg-border border border-border">
      {PACKS.map((p) => (
        <div
          key={p.id}
          className={`bg-surface p-6 flex flex-col justify-between min-h-[200px] ${
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
              ${p.usd}
              <span className="mono text-[11px] tracking-wider text-text-dim ml-2 uppercase">/ month</span>
            </div>
            <div className="mono text-[10px] tracking-widest text-text-mute uppercase">
              {p.tokens} токенов · {p.desc}
            </div>
          </div>
          <button
            onClick={() => buy(p.id)}
            disabled={busy !== null}
            className={'featured' in p && p.featured ? 'btn-primary mt-5 justify-center' : 'btn-ghost mt-5 justify-center'}
          >
            {busy === p.id ? 'Adding…' : `Buy · +${p.tokens}t`}
          </button>
        </div>
      ))}
      {error && (
        <div className="bg-surface px-5 py-3 col-span-3">
          <span className="mono text-[11px] text-pink tracking-wider">/ERROR — {error}</span>
        </div>
      )}
    </div>
  );
}
