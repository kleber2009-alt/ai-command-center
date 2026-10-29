'use client';

// Модуль F · «Тренды недели в твоей нише» (Мастер-ТЗ §8). Топ аудио, архетипы
// хуков, растущие форматы/темы за 7/30 дней. Кнопка «Сделать по тренду» →
// создаёт бриф (структура §2) и ведёт в воркспейс.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Music, Anchor, LayoutGrid, Hash, RefreshCw, TrendingUp, TrendingDown, Wand2 } from 'lucide-react';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';
import { PageHero } from '@/components/shell/page-hero';
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
      <PageHero
        eyebrow="РЕСЁРЧ · ТРЕНДЫ"
        title="Тренды"
        icon="trends"
        description="аудио · хуки · форматы · темы за окно"
        extra={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-border-soft bg-white/[0.04] p-1">
              {[7, 30].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => reload(niche, w)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                    windowDays === w ? 'bg-blue text-white' : 'text-text-dim hover:text-text'
                  }`}
                >
                  {w} дней
                </button>
              ))}
            </div>
            <select
              value={niche}
              onChange={(e) => reload(e.target.value, windowDays)}
              className="input !w-auto !rounded-full !py-2 !text-[13px]"
            >
              <option value="all">Все ниши</option>
              {niches.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {loading && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-text-mute">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                обновление…
              </span>
            )}
          </div>
        }
      />

      <div className={`grid lg:grid-cols-2 gap-4 stagger transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <TrendCard
          title="Топ аудио"
          icon="voice"
          lucide={<Music size={14} />}
          items={trends.audio}
          metric="virality"
          empty="Нет данных по аудио за период"
        />
        <TrendCard
          title="Архетипы хуков"
          icon="hooks"
          lucide={<Anchor size={14} />}
          items={trends.hooks}
          metric="views"
          empty="Нет хуков за период"
          onMake={(item) => makeBrief('hook', item)}
          makeKey={(item) => `hook:${item.key}`}
          making={making}
        />
        <TrendCard
          title="Форматы"
          icon="carousel"
          lucide={<LayoutGrid size={14} />}
          items={trends.formats}
          metric="virality"
          empty="Нет данных по форматам"
          onMake={(item) => makeBrief('format', item)}
          makeKey={(item) => `format:${item.key}`}
          making={making}
        />
        <TrendCard
          title="Растущие темы"
          icon="trends"
          lucide={<Hash size={14} />}
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
  lucide,
  items,
  metric,
  empty,
  onMake,
  makeKey,
  making,
}: {
  title: string;
  icon: Icon3DName;
  lucide: React.ReactNode;
  items: TrendItem[];
  metric: 'virality' | 'views';
  empty: string;
  onMake?: (item: TrendItem) => void;
  makeKey?: (item: TrendItem) => string;
  making?: string | null;
}) {
  return (
    <section className="panel p-5 grid gap-3 content-start">
      <h2 className="flex items-center gap-3 text-[16px] font-semibold tracking-[-0.02em] text-text">
        <Icon3D name={icon} size={22} tile />
        {title}
        <span className="ml-auto text-text-mute">{lucide}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-center text-[13px] text-text-mute">{empty}</p>
      ) : (
        <ul className="grid gap-0.5">
          {items.map((it) => {
            const busy = makeKey && making === makeKey(it);
            return (
              <li
                key={it.key}
                className="flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
              >
                <span className="text-[13.5px] text-text truncate flex-1" title={it.label}>
                  {it.label}
                </span>
                {it.deltaPct != null && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      it.deltaPct >= 0 ? 'bg-lime/10 text-lime' : 'bg-pink/10 text-pink'
                    }`}
                  >
                    {it.deltaPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {Math.abs(it.deltaPct)}%
                  </span>
                )}
                <span className="text-[13px] font-semibold tabular-nums text-text w-16 text-right">
                  {metric === 'virality'
                    ? it.avgVirality != null
                      ? `${it.avgVirality}×`
                      : '—'
                    : it.avgViews != null
                      ? fmt(it.avgViews)
                      : '—'}
                </span>
                <span className="text-[12px] tabular-nums text-text-mute w-10 text-right">
                  ×{it.count}
                </span>
                {onMake && (
                  <button
                    type="button"
                    onClick={() => onMake(it)}
                    disabled={!!busy}
                    title="Сделать по тренду → бриф"
                    className="inline-flex items-center gap-1 rounded-full border border-border-soft bg-white/[0.04] px-2.5 py-1 text-[12px] text-text-dim transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-50"
                  >
                    <Wand2 size={12} /> {busy ? '…' : 'бриф'}
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
