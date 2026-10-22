'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, Download, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { findTemplate, getTemplate as legacyShim } from '@/lib/edit-templates';
import { jobErrorText } from '@/lib/error-text';
import { statusLabel } from '@/lib/i18n';

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
    <article id={e.id} className="panel grid scroll-mt-24 gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`status-badge ${
            e.status === 'completed' ? 'status-ready' :
            e.status === 'failed' ? 'status-failed' :
            e.status === 'pending' ? 'status-queued' :
            'status-processing'
          }`}
        >
          {statusLabel(e.status)}
        </span>
        <span className="truncate text-[12px] font-medium text-text-mute">
          {resolvedName.toUpperCase()} · {e.subtitleLanguage.toUpperCase()}
          {e.brollsEnabled && <span className="text-lime"> · ПЕРЕБИВКИ</span>}
        </span>
      </div>

      <div
        className={`relative ${aspectClass} flex items-center justify-center overflow-hidden rounded-[18px] border border-border-soft bg-bg`}
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
                  : 'linear-gradient(170deg, rgba(31,123,255,0.22) 0%, rgba(11,11,13,1) 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="relative z-[1] text-center px-3">
              {e.status === 'failed' ? (
                <>
                  <span className="status-badge status-failed">ошибка</span>
                  {e.errorMsg && (
                    <div className="mt-2 text-[12px] text-text-dim">{jobErrorText(e.errorMsg)}</div>
                  )}
                </>
              ) : (
                <>
                  <Loader2 size={20} className="mx-auto animate-spin text-gold" />
                  <div className="mt-2 text-[14px] font-medium text-text">Submagic монтирует… ~3–8 мин</div>
                  {e.submagicProjectId && (
                    <div className="mt-1 text-[11px] text-text-mute">
                      submagic · {e.submagicProjectId.slice(0, 10)}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="text-[13px] leading-snug text-text-dim">
        {preset?.tags.join(' · ') ?? '—'}
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] tabular-nums text-text-mute">
        <span>{e.subtitlesEnabled ? 'с субтитрами' : 'без субтитров'}{e.brollsEnabled ? ' · с перебивками' : ''}</span>
        <span>{formatDate(e.createdAt)}</span>
      </div>
      {e.status === 'completed' && e.resultUrl && (
        <div className="grid gap-2">
          <a
            href={`/api/edits/${e.id}/download`}
            download
            className="btn-ghost justify-center"
          >
            <Download size={15} /> Скачать MP4
          </a>
          <a
            href={`/schedule/new?source=edit&id=${e.id}`}
            className="btn-primary justify-center"
          >
            <CalendarPlus size={15} /> Запланировать публикацию
          </a>
        </div>
      )}
    </article>
  );
}
