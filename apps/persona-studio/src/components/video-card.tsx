'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils';

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

  return (
    <article id={v.id} className="bg-surface border border-border p-4 grid gap-3">
      <div className="flex items-baseline justify-between">
        <span
          className={`mono text-[10px] tracking-widest uppercase font-bold ${
            v.status === 'completed' ? 'text-lime' :
            v.status === 'failed' ? 'text-pink' :
            'text-cyan animate-pulse'
          }`}
        >
          /{v.status}
        </span>
        <span className="mono text-[10px] tracking-widest text-text-mute">{v.aspect} · {v.language}</span>
      </div>

      <div
        className={`relative ${aspectClass} border border-border-2 overflow-hidden flex items-center justify-center bg-bg`}
      >
        {v.status === 'completed' && v.videoUrl ? (
          <video
            src={v.videoUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            poster={v.avatar?.imageUrl ?? undefined}
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: v.avatar?.imageUrl
                  ? `linear-gradient(180deg, rgba(8,8,8,0.0) 0%, rgba(8,8,8,0.7) 100%), url(${v.avatar.imageUrl})`
                  : 'linear-gradient(170deg, #0a1820 0%, #051018 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="relative z-[1] text-center px-3">
              {v.status === 'failed' ? (
                <>
                  <div className="mono text-pink text-[11px] tracking-widest uppercase font-bold">/FAILED</div>
                  {v.errorMsg && (
                    <div className="font-serif italic text-[12px] text-text-dim mt-2">{v.errorMsg.slice(0, 140)}</div>
                  )}
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="btn-primary justify-center mt-3 mx-auto disabled:opacity-60"
                  >
                    {retrying ? 'Повтор…' : 'Повторить ↻'}
                  </button>
                  {retryError && (
                    <div className="mono text-pink text-[9px] tracking-widest uppercase mt-2">{retryError}</div>
                  )}
                </>
              ) : (
                <>
                  <div className="mono text-cyan text-[11px] tracking-widest uppercase animate-pulse">/{v.status}</div>
                  <div className="font-serif italic text-[14px] text-text mt-2">Рендерим… ~2–4 мин</div>
                  {(v.engineJobId || v.heygenJobId) && (
                    <div className="mono text-[9px] tracking-widest text-text-mute mt-1">
                      {v.engine} · {(v.engineJobId ?? v.heygenJobId)!.slice(0, 8)}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="font-serif italic text-[14px] text-text-dim leading-snug">
        {v.script
          ? `«${v.script.length > 140 ? v.script.slice(0, 140) + '…' : v.script}»`
          : v.audioUrl
            ? `🎵 ${v.audioUrl.slice(v.audioUrl.lastIndexOf('/') + 1)}`
            : '—'}
      </div>
      <div className="flex items-center justify-between mono text-[9px] tracking-widest text-text-mute">
        <span>{v.avatar?.styleLabel ?? '—'}</span>
        <span>{formatDate(v.createdAt)}</span>
      </div>
      {v.status === 'completed' && v.videoUrl && (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`/api/videos/${v.id}/download`}
            download
            className="btn-ghost justify-center"
          >
            Скачать ↓
          </a>
          <a
            href={`/edits/new?videoId=${v.id}`}
            className="btn-primary justify-center"
          >
            В монтаж →
          </a>
        </div>
      )}
    </article>
  );
}
