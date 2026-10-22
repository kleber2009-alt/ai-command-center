'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarClock, Download, Loader2, Music, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { jobErrorText } from '@/lib/error-text';

type Video = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  engine: string;
  script: string | null;
  audioUrl: string | null;
  language: string | null;
  aspect: string;
  background: string | null;
  videoUrl: string | null;
  engineJobId: string | null;
  heygenJobId: string | null;
  errorMsg: string | null;
  createdAt: string;
  avatar: { id: string; styleLabel: string; imageUrl: string } | null;
};

export function VideoCard({ initial, autopoll }: { initial: Video; autopoll: boolean }) {
  const [v, setV] = useState<Video>(initial);
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/videos/${v.id}/retry`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRetryError(
          data.error === 'insufficient_tokens'
            ? 'Недостаточно токенов'
            : data.error === 'avatar_not_ready'
              ? 'Аватар ещё не готов'
              : 'Не удалось повторить',
        );
        return;
      }
      router.refresh();
    } catch {
      setRetryError('Сеть недоступна');
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!autopoll) return;
    if (v.status === 'completed' || v.status === 'failed') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/videos?id=${v.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as Video;
        if (stopped) return;
        setV(next);
        if (next.status === 'completed' || next.status === 'failed') return;
        timer = setTimeout(tick, 6000);
      } catch {
        timer = setTimeout(tick, 10000);
      }
    };

    timer = setTimeout(tick, 5000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [autopoll, v.id, v.status]);

  const aspectClass = v.aspect === '1:1' ? 'aspect-square' : v.aspect === '16:9' ? 'aspect-video' : 'aspect-[9/16]';

  const statusCls =
    v.status === 'pending' ? 'queued' : ['processing', 'completed', 'failed'].includes(v.status) ? v.status : 'processing';

  return (
    <article id={v.id} className="card-editorial grid gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={`status-badge status-${statusCls}`}>{v.status}</span>
        <span className="text-[12px] tabular-nums text-text-mute">{v.aspect} · {v.language}</span>
      </div>

      <div
        className={`relative ${aspectClass} flex items-center justify-center overflow-hidden rounded-[18px] border border-border-soft bg-bg`}
      >
        {v.status === 'completed' && v.videoUrl ? (
          <video
            src={v.videoUrl}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
            poster={v.avatar?.imageUrl ?? undefined}
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: v.avatar?.imageUrl
                  ? `linear-gradient(180deg, rgba(11,11,13,0.15) 0%, rgba(11,11,13,0.8) 100%), url(${v.avatar.imageUrl})`
                  : 'linear-gradient(170deg, rgba(31,123,255,0.22) 0%, rgba(11,11,13,0.9) 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="relative z-[1] grid justify-items-center px-3 text-center">
              {v.status === 'failed' ? (
                <>
                  <span className="status-badge status-failed bg-black/50">/FAILED</span>
                  {v.errorMsg && (
                    <div className="mt-2 max-w-[28ch] text-[12px] leading-snug text-text-dim">{jobErrorText(v.errorMsg)}</div>
                  )}
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="btn-primary mx-auto mt-3 justify-center"
                  >
                    {retrying ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
                    {retrying ? 'Повтор…' : 'Повторить'}
                  </button>
                  {retryError && (
                    <div className="mt-2 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-danger">{retryError}</div>
                  )}
                </>
              ) : (
                <>
                  <span className={`status-badge status-${statusCls} bg-black/50`}>/{v.status}</span>
                  <div className="mt-2.5 text-[15px] font-semibold tracking-[-0.01em] text-text">Рендерим… ~2–4 мин</div>
                  {(v.engineJobId || v.heygenJobId) && (
                    <div className="mt-1 font-mono text-[10px] text-text-mute">
                      {v.engine} · {(v.engineJobId ?? v.heygenJobId)!.slice(0, 8)}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="text-[13px] leading-snug text-text-dim">
        {v.script ? (
          `«${v.script.length > 140 ? v.script.slice(0, 140) + '…' : v.script}»`
        ) : v.audioUrl ? (
          <span className="inline-flex items-center gap-1.5">
            <Music size={13} aria-hidden className="shrink-0 text-gold" />
            {v.audioUrl.slice(v.audioUrl.lastIndexOf('/') + 1)}
          </span>
        ) : (
          '—'
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-text-mute">
        <span className="truncate">{v.avatar?.styleLabel ?? '—'}</span>
        <span className="shrink-0 tabular-nums">{formatDate(v.createdAt)}</span>
      </div>
      {v.status === 'completed' && v.videoUrl && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`/api/videos/${v.id}/download`}
              download
              className="btn-ghost justify-center !px-3"
            >
              <Download size={15} aria-hidden />
              Скачать
            </a>
            <a
              href={`/edits/new?videoId=${v.id}`}
              className="btn-primary justify-center !px-3"
            >
              В монтаж
              <ArrowRight size={15} aria-hidden />
            </a>
          </div>
          <a
            href={`/schedule/new?source=video&id=${v.id}`}
            className="btn-ghost justify-center"
          >
            <CalendarClock size={15} aria-hidden />
            Запланировать публикацию
          </a>
        </div>
      )}
    </article>
  );
}
