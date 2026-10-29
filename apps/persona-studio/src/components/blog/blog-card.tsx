'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Award,
  CalendarClock,
  ExternalLink,
  Eye,
  GalleryHorizontal,
  Heart,
  Layers,
  Loader2,
  MessageCircle,
  Repeat2,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { igProxy } from '@/components/research/types';
import type { BlogItem } from '@/lib/blog/items';
import { REMIX_COOLDOWN_DAYS } from '@/lib/blog/rank';

export const fmtCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

export function ageLabel(days: number | null): string {
  if (days == null) return 'дата неизвестна';
  if (days < 1) return 'сегодня';
  const d = Math.round(days);
  if (d < 30) return `${d} дн. назад`;
  const m = Math.round(d / 30);
  return `${m} мес. назад`;
}

type Props = {
  item: BlogItem;
  busy: boolean;
  onRemix: (item: BlogItem) => void;
};

export function BlogCard({ item, busy, onRemix }: Props) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const isCarousel = item.kind === 'carousel';
  const thumb = item.thumbnailUrl && !thumbFailed ? igProxy(item.thumbnailUrl) : null;
  const first = (item.caption ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const leftDays = item.ageDays != null ? Math.max(1, Math.ceil(REMIX_COOLDOWN_DAYS - item.ageDays)) : null;

  const metrics: Array<{ icon: typeof Eye; value: string; label: string; strong?: boolean }> = isCarousel
    ? [
        { icon: MessageCircle, value: fmtCount(item.comments), label: 'комментарии', strong: (item.ratios.comments ?? 0) >= 1.5 },
        { icon: Repeat2, value: fmtCount(item.shares), label: 'репосты', strong: (item.ratios.shares ?? 0) >= 1.5 },
        { icon: Heart, value: item.likes > 0 ? fmtCount(item.likes) : '—', label: 'лайки' },
        { icon: Layers, value: String(item.slideCount || '—'), label: 'слайдов' },
      ]
    : [
        { icon: Eye, value: fmtCount(item.plays), label: 'просмотры', strong: (item.ratios.views ?? 0) >= 1.5 },
        { icon: Sparkles, value: `${item.er.toFixed(1)}%`, label: 'вовлечение', strong: (item.ratios.er ?? 0) >= 1.5 },
        { icon: Repeat2, value: fmtCount(item.shares), label: 'репосты', strong: (item.ratios.shares ?? 0) >= 1.5 },
        { icon: Timer, value: item.durationSec ? `${Math.round(item.durationSec)}с` : '—', label: 'длительность' },
      ];

  return (
    <article className={`card-editorial flex flex-col overflow-hidden ${item.best ? '!border-gold/45' : ''}`}>
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-white/[0.04]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-mute">
            <Icon3D name={isCarousel ? 'carousel' : 'video'} size={36} />
            {isCarousel ? 'карусель' : 'рилс'}
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {item.best && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
              <Award size={12} /> лучшее
            </span>
          )}
          {item.winner && (
            <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-lime backdrop-blur-md">победитель</span>
          )}
          {item.strongBody && (
            <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-amber backdrop-blur-md" title="Слайды сильные, но комментариев мало — смени хук">
              сильная начинка
            </span>
          )}
        </div>
        <div className="absolute right-2.5 top-2.5 rounded-full bg-black/65 px-2 py-1 text-[11px] font-bold tabular-nums text-text backdrop-blur-md" title="Во сколько раз пост сильнее твоего типичного">
          ×{item.score.toFixed(1)}
        </div>
        {isCarousel && item.slideCount > 0 && (
          <div className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold text-text backdrop-blur-md">
            <GalleryHorizontal size={12} /> {item.slideCount}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2 text-[12px] text-text-mute">
          <span className="tabular-nums">#{item.rank} · {ageLabel(item.ageDays)}</span>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-text-dim hover:text-gold">
            оригинал <ExternalLink size={12} />
          </a>
        </div>
        <p className="line-clamp-2 min-h-[2.6em] text-[14px] font-medium leading-snug text-text">{first || 'Без подписи'}</p>

        <div className="grid grid-cols-4 gap-1.5">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-white/[0.04] px-2 py-2 text-center" title={m.label}>
              <m.icon size={13} className={`mx-auto mb-1 ${m.strong ? 'text-lime' : 'text-text-mute'}`} />
              <div className={`text-[13px] font-bold tabular-nums ${m.strong ? 'text-lime' : 'text-text'}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {item.cooldown && (
          <p className="flex items-start gap-1.5 rounded-xl border border-amber/30 bg-amber/[0.07] px-3 py-2 text-[12px] leading-snug text-amber">
            <CalendarClock size={13} className="mt-0.5 shrink-0" />
            Рано перевыкладывать — подожди ещё {leftDays} дн., иначе Instagram срежет охват похожему посту.
          </p>
        )}

        <div className="mt-auto pt-1">
          <button type="button" onClick={() => onRemix(item)} disabled={busy} className={`w-full justify-center ${item.pipelineId ? 'btn-ghost' : 'btn-primary'}`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {item.pipelineId ? 'Открыть ветку' : 'Уникализировать'}
            {!busy && <ArrowRight size={15} />}
          </button>
        </div>
      </div>
    </article>
  );
}
