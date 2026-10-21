'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { igProxy, type ResearchReelView } from './types';
import { AddToFolderModal } from './add-to-folder-modal';
import { ArrowRight, Copy, ExternalLink, Flame, FolderPlus, Heart, RefreshCw } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';

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
  if (v == null) return 'bg-black/60 text-text-mute';
  if (v >= 10) return 'bg-blue text-white shadow-glow';
  if (v >= 3) return 'bg-lime text-bg';
  return 'bg-black/60 text-text';
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
      className={`card-editorial group flex flex-col overflow-hidden ${
        blurred ? 'pointer-events-none select-none' : ''
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/5] overflow-hidden rounded-t-[23px] bg-white/[0.03]">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={igProxy(reel.thumbnailUrl)}
            alt={reel.author.username}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className={`w-full h-full object-cover transition-transform duration-500 ease-settle group-hover:scale-[1.03] ${blurred ? 'blur-md' : ''}`}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${blurred ? 'blur-md' : ''}`}>
            <Icon3D name="video" size={40} />
          </div>
        )}

        {/* Type badge + virality top-left */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em] text-text backdrop-blur-md">
            REEL
          </span>
          {virality != null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums backdrop-blur-md ${viralityClass(
                virality,
              )}`}
              title={`Виральность: ${virality}× от медианы автора (${formatCount(reel.author.medianViews || 0)})`}
            >
              <Flame className="h-3.5 w-3.5" />
              {virality.toFixed(1)}×
            </span>
          )}
        </div>

        {/* Top-right actions */}
        <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={toggleFavorite}
            className={`${thumbBtn} ${favorited ? '!border-pink/60 !text-pink' : 'hover:!text-pink'}`}
            title={favorited ? 'В избранном (клик чтобы убрать)' : 'В избранное'}
            aria-label="favorite"
          >
            <Heart className={`h-3.5 w-3.5 ${favorited ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowFolderModal(true)}
            className={thumbBtn}
            title="В папку"
            aria-label="add to folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <a
            href={reel.url}
            target="_blank"
            rel="noopener noreferrer"
            className={thumbBtn}
            title="Открыть в Instagram"
            aria-label="Открыть в Instagram"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={cloneFormat}
            disabled={cloning}
            className={`${thumbBtn} disabled:opacity-50`}
            title="Клонировать формат → бриф в воркспейсе"
            aria-label="clone format"
          >
            {cloning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* ER + score footer over thumb */}
        {reel.engagementRate != null && (
          <div className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-cyan backdrop-blur-md">
            ER {reel.engagementRate.toFixed(1)}%
          </div>
        )}
        {reel.viralScore != null && (
          <div className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] tabular-nums text-text-dim backdrop-blur-md">
            <span className="font-semibold text-text">{reel.viralScore.toFixed(0)}</span>/100
          </div>
        )}
      </div>

      {/* Metrics row */}
      <div className="px-4 py-3 grid grid-cols-4 gap-2 border-b border-border-soft">
        <Metric label="ПРОСМ." value={reel.views} />
        <Metric label="ЛАЙКИ" value={reel.likes} />
        <Metric label="КОММ." value={reel.comments} />
        <Metric label="РЕПОСТ" value={reel.shares} dashIfZero />
      </div>

      {/* Author row */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-border-soft">
        {reel.author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={igProxy(reel.author.avatarUrl)}
            alt={reel.author.username}
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-full object-cover bg-white/[0.05] ring-1 ring-white/10"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/[0.05] ring-1 ring-white/10" />
        )}
        <Link
          href={`/research/author/${reel.author.username}`}
          className="text-[13px] font-medium text-text hover:text-gold truncate flex-1 transition-colors"
          title="Анализ профиля"
        >
          @{reel.author.username}
        </Link>
        {reel.author.followers != null && (
          <span className="text-[12px] tabular-nums text-text-mute">
            {formatCount(reel.author.followers)}
          </span>
        )}
      </div>

      {/* Caption + date */}
      <div className="px-4 py-3 flex-1 grid gap-1.5 content-start">
        {reel.caption && (
          <p className="text-[13px] leading-snug text-text-dim line-clamp-2">
            {reel.caption}
          </p>
        )}
        <span className="text-[12px] text-text-mute">
          {relativeDate(reel.postedAt)}
        </span>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4">
        <Link
          href={`/research/${reel.id}`}
          className="btn-primary w-full !py-2.5 !text-[13px]"
        >
          Анализ видео
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
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

const thumbBtn =
  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-text backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/70';

function Metric({ label, value, dashIfZero }: { label: string; value: number; dashIfZero?: boolean }) {
  const show = !(dashIfZero && (!value || value === 0));
  return (
    <div className="grid gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-mute">{label}</span>
      <span className="text-[14px] font-bold tabular-nums tracking-[-0.01em] text-text">
        {show ? formatCount(value) : '—'}
      </span>
    </div>
  );
}
