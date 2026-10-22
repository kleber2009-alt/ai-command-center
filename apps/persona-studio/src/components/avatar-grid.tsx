'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Download, Loader2 } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { errorText, exceptionText } from '@/lib/error-text';

type Avatar = {
  id: string;
  generationId: string;
  imageUrl: string;
  style: string;
  styleLabel: string;
  status: 'pending' | 'done' | 'failed';
  selected: boolean;
  errorMsg?: string | null;
};

type Generation = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  avatars: Avatar[];
};

export function AvatarGrid({ generationId }: { generationId: string }) {
  const [gen, setGen] = useState<Generation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/generate-avatars?id=${generationId}`, { cache: 'no-store' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setErr(errorText(j, res.status));
          return;
        }
        const data = (await res.json()) as Generation;
        if (stopped) return;
        setGen(data);
        if (data.status === 'completed' || data.status === 'failed') return;
        timer = setTimeout(poll, 3500);
      } catch (e) {
        setErr(exceptionText(e));
      }
    };

    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [generationId]);

  const onSelect = async (id: string) => {
    setSelecting(id);
    try {
      const res = await fetch(`/api/avatars/${id}/select`, { method: 'POST' });
      if (res.ok && gen) {
        setGen({
          ...gen,
          avatars: gen.avatars.map((a) =>
            a.generationId === gen.id ? { ...a, selected: a.id === id } : a,
          ),
        });
      }
    } finally {
      setSelecting(null);
    }
  };

  if (err)
    return (
      <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">/ERROR {err}</p>
    );
  if (!gen)
    return (
      <p className="inline-flex items-center gap-2 text-[13px] text-text-mute">
        <Loader2 size={15} className="animate-spin" aria-hidden />
        /LOADING…
      </p>
    );

  const selected = gen.avatars.find((a) => a.selected);
  const statusCls = gen.status === 'pending' ? 'queued' : gen.status;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="sec-num">/00</span>
        <span className="sec-title">Generation {gen.id.slice(0, 8)}</span>
        <span className="hidden h-px flex-1 bg-border-soft sm:block" />
        <span className={`status-badge status-${statusCls}`}>{gen.status}</span>
      </div>

      <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-5">
        {gen.avatars.map((a, i) => (
          <div
            key={a.id}
            className={`group relative aspect-[4/5] overflow-hidden rounded-[20px] border bg-surface transition-all duration-300 ease-settle ${
              a.selected ? 'border-transparent ring-2 ring-blue shadow-glow' : 'border-border-soft'
            } ${a.status === 'pending' ? 'skeleton' : ''}`}
            style={
              a.status === 'done' && a.imageUrl
                ? { backgroundImage: `url(${a.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : undefined
            }
          >
            {/* Top-left: index. Top-right reserved for download. */}
            <span className="absolute left-2 top-2 z-[3] rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white/80 backdrop-blur-md">
              {(i + 1).toString().padStart(2, '0')}
            </span>
            {a.status === 'done' && (
              <a
                href={`/api/avatars/${a.id}/download`}
                download
                onClick={(e) => e.stopPropagation()}
                className="absolute right-2 top-2 z-[5] flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-md transition-colors hover:bg-blue hover:text-white"
                title="Скачать аватар"
                aria-label="Скачать"
              >
                <Download size={14} aria-hidden />
              </a>
            )}

            {/* Bottom caption — full-width gradient strip so text is always legible */}
            <div className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2.5 pt-8">
              <div className="line-clamp-2 text-[13px] font-semibold leading-tight tracking-[-0.01em] sm:text-[14px]">{a.styleLabel}</div>
              <div className={`mt-1 text-[11px] ${a.status === 'failed' ? 'text-danger' : a.selected ? 'text-gold' : 'text-text-dim'}`}>
                {a.status === 'pending' && '/queued…'}
                {a.status === 'done' && (a.selected ? '/selected' : '/ready · tap to choose')}
                {a.status === 'failed' && '/failed'}
              </div>
            </div>

            {/* Tap target — works on touch (no hover required). Selected gets a visible badge. */}
            {a.status === 'done' && (
              <button
                type="button"
                onClick={() => onSelect(a.id)}
                disabled={selecting === a.id}
                aria-label={a.selected ? 'Выбранный аватар' : 'Выбрать этот аватар'}
                className="absolute inset-0 flex h-full w-full items-center justify-center bg-transparent transition-colors active:bg-black/45 md:hover:bg-black/40"
              >
                {selecting === a.id ? (
                  <Loader2 size={20} className="animate-spin text-white" aria-hidden />
                ) : a.selected ? (
                  <span className="pop-in inline-flex items-center gap-1.5 rounded-full bg-blue px-3 py-1.5 text-[12px] font-semibold text-white shadow-glow">
                    <Check size={14} aria-hidden />
                    Selected
                  </span>
                ) : null}
              </button>
            )}
            {a.status === 'pending' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="status-badge status-processing">/RENDER</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="panel reveal mt-2 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <Icon3D name="done" size={28} tile />
            <div>
              <div className="label mb-1 !text-lime">/ selected</div>
              <div className="text-[20px] font-semibold tracking-[-0.02em] sm:text-[22px]">{selected.styleLabel}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="btn-primary"
              href={`/videos/new?avatarId=${selected.id}`}
            >
              Создать видео
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link
              className="btn-ghost"
              href={`/covers/new?avatarId=${selected.id}`}
            >
              Создать обложку
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link className="btn-ghost" href="/avatars">
              Все аватары
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
