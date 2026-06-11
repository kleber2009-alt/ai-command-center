'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ParserItemSerialized } from './types';
import { igProxy } from '../research/types';

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

/**
 * Компактная list-row карточка: мелкий thumb (4:5) или placeholder, метрики
 * в строку, текстовая часть на всю ширину. IG-CDN thumbnail-URL часто 403,
 * поэтому есть onError fallback на placeholder без зияющего пустого блока.
 */
export function ParserReelCard({ item, onUpdated, onRemoved }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const isUsed = item.status === 'used';
  const isCarousel = item.kind === 'carousel';

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

  async function rewriteAndGo() {
    if (rewriting) return;
    setRewriting(true);
    setError(null);
    try {
      if (isCarousel) {
        const res = await fetch('/api/carousels/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parserItemId: item.id, slidesCount: 6 }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.message || json.error || `HTTP ${res.status}`);
          return;
        }
        onUpdated({ ...item, status: 'used' });
        router.push(`/carousels/new?draftId=${json.draftId}`);
        return;
      }
      const res = await fetch(`/api/parser/items/${item.id}/rewrite`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      onUpdated({ ...item, status: 'used', rewrittenScript: json.script });
      router.push(`/videos/new?parserItemId=${item.id}`);
    } catch (e) {
      setError((e as Error).message || 'network error');
    } finally {
      setRewriting(false);
    }
  }

  const ctaLabel = rewriting
    ? isCarousel
      ? 'Уникализирую слайды…'
      : 'Уникализирую сценарий…'
    : isCarousel
      ? 'Создать карусель →'
      : item.rewrittenScript
        ? 'К видео (готов сценарий) →'
        : 'Создать видео →';

  const showThumb = item.thumbnailUrl && !thumbFailed;

  return (
    <article
      className={`border bg-surface flex items-stretch ${
        isUsed ? 'border-lime/40' : 'border-border'
      } ${isUsed ? 'opacity-90' : ''}`}
    >
      {/* Thumbnail / placeholder */}
      <div className="w-16 sm:w-20 shrink-0 bg-bg border-r border-border relative overflow-hidden">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={igProxy(item.thumbnailUrl)}
            alt={item.owner || ''}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="w-full h-full object-cover aspect-[4/5]"
          />
        ) : (
          <div className="w-full h-full aspect-[4/5] flex flex-col items-center justify-center gap-1 mono text-[8px] tracking-widest uppercase text-text-mute">
            <span className="text-[16px] opacity-30">{isCarousel ? '🖼' : '🎬'}</span>
            <span>{isCarousel ? 'CAR' : 'REEL'}</span>
          </div>
        )}
        {item.fitScore != null && (
          <div
            className={`absolute top-1 left-1 px-1 py-0.5 mono text-[9px] tracking-wider bg-black/80 ${fitColor(
              item.fitScore,
            )}`}
          >
            {item.fitScore}/10
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
        {/* Text block */}
        <div className="grid gap-1.5 min-w-0">
          <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
            <span className="mono text-[11px] tracking-wider text-text">
              @{item.owner || '—'}
            </span>
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
              {formatAge(item.ageHours)}
            </span>
            {item.kind === 'reel' && item.plays > 0 && (
              <span className="mono text-[10px] text-text-dim">
                <span className="text-text">{formatCount(item.plays)}</span> просм.
              </span>
            )}
            <span className="mono text-[10px] text-text-dim">
              <span className="text-text">{formatCount(item.likes)}</span> ❤
            </span>
            <span className="mono text-[10px] text-text-dim">
              <span className="text-text">{formatCount(item.comments)}</span> 💬
            </span>
            {isUsed && (
              <span className="mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 bg-lime text-black">
                в работе
              </span>
            )}
          </div>

          {item.fitWhy && (
            <p className="font-serif italic text-[13px] leading-snug text-text-dim line-clamp-2">
              {item.fitWhy}
            </p>
          )}
          {!item.fitWhy && item.caption && (
            <p className="font-serif text-[12.5px] leading-snug text-text-mute line-clamp-2">
              {item.caption}
            </p>
          )}

          {error && (
            <div className="border border-pink/40 bg-pink/5 px-2 py-1 mono text-[10px] text-pink">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 sm:shrink-0">
          <button
            type="button"
            onClick={rewriteAndGo}
            disabled={rewriting || busy}
            className="btn-primary whitespace-nowrap text-[11px] sm:text-[12px]"
          >
            {ctaLabel}
          </button>
          <div className="flex items-center gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-[11px] px-2"
              title="Открыть оригинал в Instagram"
            >
              IG
            </a>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy || rewriting}
              className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-pink whitespace-nowrap"
              title="Скрыть из списка"
            >
              скрыть
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
