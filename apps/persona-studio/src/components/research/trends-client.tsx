'use client';

// Модуль F · «Тренды недели в твоей нише» (Мастер-ТЗ §8). Топ аудио, архетипы
// хуков, растущие форматы/темы за 7/30 дней. Кнопка «Сделать по тренду» →
// создаёт бриф (структура §2) и ведёт в воркспейс.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Music, Anchor, LayoutGrid, Hash, TrendingUp, TrendingDown, Wand2 } from 'lucide-react';
import type { TrendItem, TrendsResult } from '@/lib/research/trends';

type MakeKind = 'hook' | 'format' | null;

export function TrendsClient({
  initialTrends,
  niches,
}: {
  initialTrends: TrendsResult;
  niches: string[];
}) {
  const router = useRouter();
  const [trends, setTrends] = useState<TrendsResult>(initialTrends);
  const [niche, setNiche] = useState(initialTrends.niche);
  const [windowDays, setWindowDays] = useState<number>(initialTrends.windowDays);
  const [loading, setLoading] = useState(false);
  const [making, setMaking] = useState<string | null>(null);

  async function reload(nextNiche: string, nextWindow: number) {
    setLoading(true);
    setNiche(nextNiche);
    setWindowDays(nextWindow);
    try {
      const res = await fetch(`/api/research/trends?niche=${encodeURIComponent(nextNiche)}&window=${nextWindow}`);
      const data = await res.json();
      if (res.ok) setTrends(data.trends);
    } finally {
      setLoading(false);
    }
  }

  // «Сделать по тренду» → бриф (только структура, §2) → воркспейс.
  async function makeBrief(kind: 'hook' | 'format', item: TrendItem) {
    const tag = `${kind}:${item.key}`;
    setMaking(tag);
    try {
      const body: Record<string, unknown> = {
        topic: niche !== 'all' ? niche : null,
      };
      if (kind === 'hook') body.hookArchetype = item.key;
      else body.format = item.key;
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.brief) router.push(`/briefs/${data.brief.id}`);
      else setMaking(null);
    } catch {
      setMaking(null);
    }
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="font-serif text-2xl text-text">Тренды</h1>
        <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
          аудио · хуки · форматы · темы за окно
        </p>
      </header>

      {/* Контролы */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {[7, 30].map((w) => (
            <button
              key={w}
              onClick={() => reload(niche, w)}
              className={`px-2.5 py-1 border mono text-[10px] tracking-widest uppercase ${
                windowDays === w ? 'border-gold text-gold' : 'border-border text-text-mute hover:border-border'
              }`}
            >
              {w} дней
            </button>
          ))}
        </div>
        <select
          value={niche}
          onChange={(e) => reload(e.target.value, windowDays)}
          className="bg-bg border border-border px-3 py-1.5 mono text-[11px] text-text focus:border-gold outline-none"
        >
          <option value="all">Все ниши</option>
          {niches.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {loading && <span className="mono text-[10px] tracking-widest uppercase text-text-mute">обновление…</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <TrendCard
          title="Топ аудио"
          icon={<Music size={14} className="text-gold" />}
          items={trends.audio}
          metric="virality"
          empty="Нет данных по аудио за период"
        />
        <TrendCard
          title="Архетипы хуков"
          icon={<Anchor size={14} className="text-gold" />}
          items={trends.hooks}
          metric="views"
          empty="Нет хуков за период"
          onMake={(item) => makeBrief('hook', item)}
          makeKey={(item) => `hook:${item.key}`}
          making={making}
        />
        <TrendCard
          title="Форматы"
          icon={<LayoutGrid size={14} className="text-gold" />}
          items={trends.formats}
          metric="virality"
          empty="Нет данных по форматам"
          onMake={(item) => makeBrief('format', item)}
          makeKey={(item) => `format:${item.key}`}
          making={making}
        />
        <TrendCard
          title="Растущие темы"
          icon={<Hash size={14} className="text-gold" />}
          items={trends.topics}
          metric="virality"
          empty="Нет тем за период"
        />
      </div>
    </div>
  );
}

function TrendCard({
  title,
  icon,
  items,
  metric,
  empty,
  onMake,
  makeKey,
  making,
}: {
  title: string;
  icon: React.ReactNode;
  items: TrendItem[];
  metric: 'virality' | 'views';
  empty: string;
  onMake?: (item: TrendItem) => void;
  makeKey?: (item: TrendItem) => string;
  making?: string | null;
}) {
  return (
    <section className="border border-border bg-surface p-4 grid gap-3 content-start">
      <h2 className="flex items-center gap-2 font-serif text-[15px] text-text">
        {icon} {title}
      </h2>
      {items.length === 0 ? (
        <p className="mono text-[10px] tracking-widest uppercase text-text-mute">{empty}</p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((it) => {
            const busy = makeKey && making === makeKey(it);
            return (
              <li
                key={it.key}
                className="flex items-center gap-2 border-b border-border-soft pb-1.5 last:border-0"
              >
                <span className="font-serif text-[13px] text-text truncate flex-1" title={it.label}>
                  {it.label}
                </span>
                {it.deltaPct != null && (
                  <span
                    className={`flex items-center gap-0.5 mono text-[9px] tracking-wider ${
                      it.deltaPct >= 0 ? 'text-lime' : 'text-pink'
                    }`}
                  >
                    {it.deltaPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {Math.abs(it.deltaPct)}%
                  </span>
                )}
                <span className="mono text-[10px] tracking-wider text-text-dim w-16 text-right">
                  {metric === 'virality'
                    ? it.avgVirality != null
                      ? `${it.avgVirality}×`
                      : '—'
                    : it.avgViews != null
                      ? fmt(it.avgViews)
                      : '—'}
                </span>
                <span className="mono text-[9px] tracking-widest uppercase text-text-mute w-10 text-right">
                  ×{it.count}
                </span>
                {onMake && (
                  <button
                    onClick={() => onMake(it)}
                    disabled={!!busy}
                    title="Сделать по тренду → бриф"
                    className="flex items-center gap-1 px-1.5 py-0.5 border border-border hover:border-gold mono text-[9px] tracking-widest uppercase text-text-dim hover:text-gold disabled:opacity-50"
                  >
                    <Wand2 size={10} /> {busy ? '…' : 'бриф'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}
