'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ParserItemSerialized } from './types';

type Props = {
  item: ParserItemSerialized;
  onUpdated: (it: ParserItemSerialized) => void;
  onRemoved: (id: string) => void;
};

const formatCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

const formatAge = (h: number) => {
  if (h < 24) return `${Math.round(h)}ч`;
  return `${Math.round(h / 24)}д`;
};

const fitColor = (score: number | null) => {
  if (score == null) return 'text-text-mute';
  if (score >= 8) return 'text-lime';
  if (score >= 6) return 'text-warm';
  return 'text-text-dim';
};

export function ParserReelCard({ item, onUpdated, onRemoved }: Props) {
  const [busy, setBusy] = useState(false);
  const isUsed = item.status === 'used';

  async function dismiss() {
    setBusy(true);
    try {
      const res = await fetch(`/api/parser/items?id=${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (res.ok) onRemoved(item.id);
    } finally {
      setBusy(false);
    }
  }

  async function markUsed() {
    setBusy(true);
    try {
      const res = await fetch(`/api/parser/items?id=${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'used' }),
      });
      if (res.ok) {
        const json = await res.json();
        onUpdated(json.item);
      }
    } finally {
      setBusy(false);
    }
  }

  const videoHref = `/videos/new?sourceUrl=${encodeURIComponent(item.url)}&parserItemId=${item.id}`;

  return (
    <article
      className={`border bg-surface flex flex-col ${
        isUsed ? 'border-lime/40 opacity-80' : 'border-border'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] bg-bg overflow-hidden border-b border-border">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt={item.owner || 'reel'}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center mono text-[10px] text-text-mute tracking-widest">
            NO PREVIEW
          </div>
        )}
        {item.fitScore != null && (
          <div
            className={`absolute top-2 left-2 px-2 py-1 mono text-[11px] tracking-wider bg-black/80 ${fitColor(
              item.fitScore,
            )}`}
          >
            {item.fitScore}/10
          </div>
        )}
        {isUsed && (
          <div className="absolute top-2 right-2 px-2 py-1 mono text-[9px] tracking-widest uppercase bg-lime text-black">
            в работе
          </div>
        )}
      </div>

      <div className="p-4 grid gap-3 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="mono text-[11px] tracking-wider text-text">
            @{item.owner || '—'}
          </span>
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
            {formatAge(item.ageHours)}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mono text-[10px] tracking-wider text-text-dim">
          {item.kind === 'reel' && item.plays > 0 && (
            <span>
              <span className="text-text">{formatCount(item.plays)}</span> просм.
            </span>
          )}
          <span>
            <span className="text-text">{formatCount(item.likes)}</span> ❤
          </span>
          <span>
            <span className="text-text">{formatCount(item.comments)}</span> 💬
          </span>
        </div>

        {item.fitWhy && (
          <p className="font-serif italic text-[12.5px] leading-snug text-text-dim line-clamp-3">
            {item.fitWhy}
          </p>
        )}

        {item.caption && !item.fitWhy && (
          <p className="font-serif text-[12px] leading-snug text-text-mute line-clamp-2">
            {item.caption}
          </p>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2 mt-auto pt-2 border-t border-border">
          <Link
            href={videoHref}
            onClick={markUsed}
            className="btn-primary text-center"
            aria-disabled={busy}
          >
            Создать видео →
          </Link>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            title="Открыть оригинал в Instagram"
          >
            IG
          </a>
        </div>

        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-pink justify-self-start"
        >
          Скрыть из списка
        </button>
      </div>
    </article>
  );
}
