'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { igProxy, type ResearchReelView } from './types';
import { AddToFolderModal } from './add-to-folder-modal';

type Props = {
  reel: ResearchReelView;
  blurred?: boolean;
  /** Initial favorite state (true если уже в избранном). По умолчанию false. */
  initialFavorited?: boolean;
};

const formatCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return 'сегодня';
  if (d < 7) return `${d} д. назад`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} нед. назад`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} мес. назад`;
  return `${Math.floor(d / 365)} г. назад`;
}

/**
 * Виральность как «пламенный» бейдж по ТЗ §5: "значок-пламя Xn — крупно,
 * верх-лево, акцентом". Цвет зависит от значения: ≥10x — gold, ≥3x — lime,
 * иначе нейтральный.
 */
function viralityClass(v: number | null): string {
  if (v == null) return 'text-text-mute border-border';
  if (v >= 10) return 'text-gold border-gold';
  if (v >= 3) return 'text-lime border-lime';
  return 'text-text border-border';
}

export function ResearchReelCard({ reel, blurred, initialFavorited = false }: Props) {
  const router = useRouter();
  const [thumbFailed, setThumbFailed] = useState(false);
  const [favorited, setFavorited] = useState(initialFavorited);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [, startFavTransition] = useTransition();
  const showThumb = reel.thumbnailUrl && !thumbFailed;
  const virality = reel.virality;

  // «Клонировать формат» (Мастер-ТЗ §2 + §4): создаёт бриф из находки —
  // переносится только структура, без дословного текста — и ведёт в воркспейс.
  async function cloneFormat() {
    if (cloning) return;
    setCloning(true);
    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceReelId: reel.id }),
      });
      const data = await res.json();
      if (res.ok && data.brief) router.push(`/briefs/${data.brief.id}`);
      else setCloning(false);
    } catch {
      setCloning(false);
    }
  }

  function toggleFavorite() {
    const next = !favorited;
    setFavorited(next); // optimistic
    startFavTransition(async () => {
      const res = await fetch('/api/research/favorites', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: 'reel', itemId: reel.id }),
      });
      if (!res.ok) setFavorited(!next); // rollback
    });
  }

  return (
    <>
    <article
      className={`relative border border-border bg-surface flex flex-col overflow-hidden ${
        blurred ? 'pointer-events-none select-none' : ''
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/5] bg-bg overflow-hidden">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={igProxy(reel.thumbnailUrl)}
            alt={reel.author.username}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className={`w-full h-full object-cover ${blurred ? 'blur-md' : ''}`}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center mono text-[9px] tracking-widest uppercase text-text-mute ${blurred ? 'blur-md' : ''}`}>
            REEL
          </div>
        )}

        {/* Type badge top-left */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/80 mono text-[9px] tracking-widest uppercase text-text">
          REEL
        </div>

        {/* Virality fire badge */}
        {virality != null && (
          <div
            className={`absolute top-2 left-16 px-2 py-1 bg-black/85 border mono text-[12px] tracking-wider ${viralityClass(
              virality,
            )}`}
            title={`Виральность: ${virality}× от медианы автора (${formatCount(reel.author.medianViews || 0)})`}
          >
            🔥 {virality.toFixed(1)}×
          </div>
        )}

        {/* Top-right actions */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={toggleFavorite}
            className={`px-1.5 py-1 bg-black/80 border mono text-[10px] ${
              favorited ? 'border-pink text-pink' : 'border-border text-text hover:border-pink'
            }`}
            title={favorited ? 'В избранном (клик чтобы убрать)' : 'В избранное'}
            aria-label="favorite"
          >
            {favorited ? '♥' : '♡'}
          </button>
          <button
            type="button"
            onClick={() => setShowFolderModal(true)}
            className="px-1.5 py-1 bg-black/80 border border-border hover:border-gold mono text-[10px] text-text"
            title="В папку"
            aria-label="add to folder"
          >
            +
          </button>
          <a
            href={reel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-1.5 py-1 bg-black/80 border border-border hover:border-lime mono text-[10px] text-text"
            title="Открыть в Instagram"
          >
            ↗
          </a>
          <button
            type="button"
            onClick={cloneFormat}
            disabled={cloning}
            className="px-1.5 py-1 bg-black/80 border border-border hover:border-gold mono text-[10px] text-text disabled:opacity-50"
            title="Клонировать формат → бриф в воркспейсе"
            aria-label="clone format"
          >
            {cloning ? '…' : '⎘'}
          </button>
        </div>

        {/* ER + score footer over thumb */}
        {reel.engagementRate != null && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/85 mono text-[10px] tracking-wider text-cyan">
            ER {reel.engagementRate.toFixed(1)}%
          </div>
        )}
        {reel.viralScore != null && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/85 mono text-[10px] tracking-wider text-text-dim">
            <span className="text-text">{reel.viralScore.toFixed(0)}</span>/100
          </div>
        )}
      </div>

      {/* Metrics row */}
      <div className="px-3 py-2 grid grid-cols-4 gap-2 border-b border-border-soft">
        <Metric label="ПРОСМ." value={reel.views} />
        <Metric label="ЛАЙКИ" value={reel.likes} />
        <Metric label="КОММ." value={reel.comments} />
        <Metric label="РЕПОСТ" value={reel.shares} dashIfZero />
      </div>

      {/* Author row */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-border-soft">
        {reel.author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={igProxy(reel.author.avatarUrl)}
            alt={reel.author.username}
            referrerPolicy="no-referrer"
            className="w-6 h-6 rounded-full object-cover bg-bg"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-bg border border-border" />
        )}
        <Link
          href={`/research/author/${reel.author.username}`}
          className="mono text-[11px] tracking-wider text-text hover:text-lime truncate flex-1"
          title="Анализ профиля"
        >
          @{reel.author.username}
        </Link>
        {reel.author.followers != null && (
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
            {formatCount(reel.author.followers)}
          </span>
        )}
      </div>

      {/* Caption + date */}
      <div className="px-3 py-2 flex-1 grid gap-1">
        {reel.caption && (
          <p className="font-serif text-[12.5px] leading-snug text-text-dim line-clamp-2">
            {reel.caption}
          </p>
        )}
        <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
          {relativeDate(reel.postedAt)}
        </span>
      </div>

      {/* CTA */}
      <Link
        href={`/research/${reel.id}`}
        className="btn-primary w-full !rounded-none border-t border-border text-[11px] tracking-widest uppercase text-center"
      >
        Анализ видео →
      </Link>
    </article>
    {showFolderModal && (
      <AddToFolderModal
        itemType="reel"
        itemId={reel.id}
        onClose={() => setShowFolderModal(false)}
      />
    )}
    </>
  );
}

function Metric({ label, value, dashIfZero }: { label: string; value: number; dashIfZero?: boolean }) {
  const show = !(dashIfZero && (!value || value === 0));
  return (
    <div className="grid gap-0.5">
      <span className="mono text-[8px] tracking-widest uppercase text-text-mute">{label}</span>
      <span className="mono text-[12px] tracking-wider text-text">
        {show ? formatCount(value) : '—'}
      </span>
    </div>
  );
}
