'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { findTemplate, getTemplate as legacyShim } from '@/lib/edit-templates';

type Edit = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  template: string;
  subtitlesEnabled: boolean;
  subtitleLanguage: string;
  brollsEnabled: boolean;
  resultUrl: string | null;
  submagicProjectId: string | null;
  errorMsg: string | null;
  createdAt: string;
  videoGeneration: {
    id: string;
    aspect: string;
    videoUrl: string | null;
    avatar: { id: string; styleLabel: string; imageUrl: string } | null;
  } | null;
};

// errorMsg хранит технический код/текст из воркера — наружу отдаём
// человеческое объяснение, токены при failed уже возвращены воркером.
function humanEditError(raw: string | null): string {
  const msg = raw ?? '';
  if (msg.includes('SUBMAGIC_NO_API_KEY') || msg.includes('not configured')) {
    return 'Монтаж временно недоступен на сервере. Токены возвращены.';
  }
  if (msg === 'enqueue_failed') {
    return 'Не удалось поставить задачу в очередь. Токены возвращены, попробуй ещё раз.';
  }
  return 'Монтаж не получился. Токены возвращены — попробуй ещё раз.';
}

export function EditCard({ initial, autopoll }: { initial: Edit; autopoll: boolean }) {
  const [e, setE] = useState<Edit>(initial);

  useEffect(() => {
    if (!autopoll) return;
    if (e.status === 'completed' || e.status === 'failed') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/edits?id=${e.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as Edit;
        if (stopped) return;
        setE(next);
        if (next.status === 'completed' || next.status === 'failed') return;
        timer = setTimeout(tick, 8000);
      } catch {
        timer = setTimeout(tick, 12000);
      }
    };

    timer = setTimeout(tick, 6000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [autopoll, e.id, e.status]);

  const aspect = e.videoGeneration?.aspect ?? '9:16';
  const aspectClass = aspect === '1:1' ? 'aspect-square' : aspect === '16:9' ? 'aspect-video' : 'aspect-[9/16]';
  // Сначала пробуем найти как canonical Submagic-имя; если запись старая
  // (legacy slug типа "hormozi") — резолвим через legacy-shim в имя и
  // подтягиваем теги по нему.
  const directHit = findTemplate(e.template);
  const legacy = !directHit ? legacyShim(e.template) : undefined;
  const resolvedName = directHit?.name ?? legacy?.submagicTemplate ?? e.template;
  const preset = directHit ?? (legacy ? findTemplate(legacy.submagicTemplate) : undefined);

  return (
    <article id={e.id} className="bg-surface border border-border p-4 grid gap-3">
      <div className="flex items-baseline justify-between">
        <span
          className={`mono text-[10px] tracking-widest uppercase font-bold ${
            e.status === 'completed' ? 'text-lime' :
            e.status === 'failed' ? 'text-pink' :
            'text-cyan animate-pulse'
          }`}
        >
          /{e.status}
        </span>
        <span className="mono text-[10px] tracking-widest text-text-mute">
          {resolvedName.toUpperCase()} · {e.subtitleLanguage.toUpperCase()}
          {e.brollsEnabled && <span className="text-lime"> · B-ROLLS</span>}
        </span>
      </div>

      <div
        className={`relative ${aspectClass} border border-border-2 overflow-hidden flex items-center justify-center bg-bg`}
      >
        {e.status === 'completed' && e.resultUrl ? (
          <video
            src={e.resultUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            poster={e.videoGeneration?.avatar?.imageUrl ?? undefined}
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background: e.videoGeneration?.avatar?.imageUrl
                  ? `linear-gradient(180deg, rgba(8,8,8,0.0) 0%, rgba(8,8,8,0.7) 100%), url(${e.videoGeneration.avatar.imageUrl})`
                  : 'linear-gradient(170deg, #0a1820 0%, #051018 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="relative z-[1] text-center px-3">
              {e.status === 'failed' ? (
                <>
                  <div className="mono text-pink text-[11px] tracking-widest uppercase font-bold">/FAILED</div>
                  <div className="font-serif italic text-[12px] text-text-dim mt-2">{humanEditError(e.errorMsg)}</div>
                </>
              ) : (
                <>
                  <div className="mono text-cyan text-[11px] tracking-widest uppercase animate-pulse">/{e.status}</div>
                  <div className="font-serif italic text-[14px] text-text mt-2">Submagic монтирует… ~3–8 мин</div>
                  {e.submagicProjectId && (
                    <div className="mono text-[9px] tracking-widest text-text-mute mt-1">
                      submagic · {e.submagicProjectId.slice(0, 10)}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="font-serif italic text-[14px] text-text-dim leading-snug">
        {preset?.tags.join(' · ') ?? '—'}
      </div>
      <div className="flex items-center justify-between mono text-[9px] tracking-widest text-text-mute">
        <span>{e.subtitlesEnabled ? 'субтитры on' : 'без субтитров'}{e.brollsEnabled ? ' · b-rolls on' : ''}</span>
        <span>{formatDate(e.createdAt)}</span>
      </div>
      {e.status === 'completed' && e.resultUrl && (
        <div className="grid gap-2">
          <a
            href={`/api/edits/${e.id}/download`}
            download
            className="btn-ghost justify-center"
          >
            Скачать MP4 ↓
          </a>
          <a
            href={`/schedule/new?source=edit&id=${e.id}`}
            className="btn-primary justify-center"
          >
            Запланировать публикацию ↗
          </a>
        </div>
      )}
    </article>
  );
}
