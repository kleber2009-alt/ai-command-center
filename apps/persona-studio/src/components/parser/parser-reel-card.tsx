'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, EyeOff, Heart, Instagram, MessageCircle, Play, RefreshCw } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import type { ParserItemSerialized } from './types';
import { igProxy } from '../research/types';
import { errorText } from '@/lib/error-text';

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
  if (score >= 6) return 'text-amber';
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
          setError(errorText(json, res.status));
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
        setError(errorText(json, res.status));
        return;
      }
      onUpdated({ ...item, status: 'used', rewrittenScript: json.script });
      router.push(`/videos/new?parserItemId=${item.id}`);
    } catch (e) {
      setError((e as Error).message || 'Нет связи с сервером');
    } finally {
      setRewriting(false);
    }
  }

  const ctaLabel = rewriting
    ? isCarousel
      ? 'Уникализирую слайды…'
      : 'Уникализирую сценарий…'
    : isCarousel
      ? 'Создать карусель'
      : item.rewrittenScript
        ? 'К видео (готов сценарий)'
        : 'Создать видео';

  const showThumb = item.thumbnailUrl && !thumbFailed;

  return (
    <article
      className={`card-editorial flex items-stretch overflow-hidden ${
        isUsed ? '!border-lime/40' : ''
      } ${isUsed ? 'opacity-90' : ''}`}
    >
      {/* Thumbnail / placeholder */}
      <div className="m-2 w-16 sm:w-20 shrink-0 rounded-2xl bg-white/[0.04] relative overflow-hidden">
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
          <div className="w-full h-full aspect-[4/5] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-mute">
            <Icon3D name={isCarousel ? 'carousel' : 'video'} size={24} />
            <span>{isCarousel ? 'КАРУСЕЛЬ' : 'РИЛС'}</span>
          </div>
        )}
        {item.fitScore != null && (
          <div
            className={`absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums bg-black/65 backdrop-blur-md ${fitColor(
              item.fitScore,
            )}`}
          >
            {item.fitScore}/10
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 p-3 sm:p-4 sm:pl-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
        {/* Text block */}
        <div className="grid gap-1.5 min-w-0">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
            <span className="text-[14px] font-semibold text-text">
              @{item.owner || '—'}
            </span>
            <span className="text-[12px] text-text-mute">
              {formatAge(item.ageHours)}
            </span>
            {item.kind === 'reel' && item.plays > 0 && (
              <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-text-dim">
                <Play className="h-3 w-3" />
                <span className="font-semibold text-text">{formatCount(item.plays)}</span> просм.
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-text-dim">
              <Heart className="h-3 w-3" />
              <span className="font-semibold text-text">{formatCount(item.likes)}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-text-dim">
              <MessageCircle className="h-3 w-3" />
              <span className="font-semibold text-text">{formatCount(item.comments)}</span>
            </span>
            {isUsed && (
              <span className="rounded-full bg-lime px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-bg">
                в работе
              </span>
            )}
          </div>

          {item.fitWhy && (
            <p className="text-[13.5px] leading-snug text-text-dim line-clamp-2">
              {item.fitWhy}
            </p>
          )}
          {!item.fitWhy && item.caption && (
            <p className="text-[13px] leading-snug text-text-mute line-clamp-2">
              {item.caption}
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-pink/40 bg-pink/[0.06] px-3 py-1.5 text-[12.5px] text-pink">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:shrink-0">
          <button
            type="button"
            onClick={rewriteAndGo}
            disabled={rewriting || busy}
            className="btn-primary !px-4 !py-2.5 !text-[13px]"
          >
            {rewriting && <RefreshCw className="h-4 w-4 animate-spin" />}
            {ctaLabel}
            {!rewriting && <ArrowRight className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-icon"
              title="Открыть оригинал в Instagram"
              aria-label="Открыть оригинал в Instagram"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy || rewriting}
              className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[12.5px] text-text-mute transition-colors hover:bg-pink/[0.08] hover:text-pink whitespace-nowrap"
              title="Скрыть из списка"
            >
              <EyeOff className="h-3.5 w-3.5" />
              скрыть
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
