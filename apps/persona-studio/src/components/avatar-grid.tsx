'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
          setErr(j.error ?? `http_${res.status}`);
          return;
        }
        const data = (await res.json()) as Generation;
        if (stopped) return;
        setGen(data);
        if (data.status === 'completed' || data.status === 'failed') return;
        timer = setTimeout(poll, 3500);
      } catch (e) {
        setErr(String(e));
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

  if (err) return <p className="mono text-pink text-[11px] tracking-widest">/ERROR {err}</p>;
  if (!gen) return <p className="mono text-text-mute text-[11px] tracking-widest">/LOADING…</p>;

  const selected = gen.avatars.find((a) => a.selected);

  return (
    <div className="grid gap-6">
      <div className="flex items-baseline gap-3">
        <span className="sec-num">/00</span>
        <span className="sec-title">Generation {gen.id.slice(0, 8)}</span>
        <span className="flex-1 border-b border-border translate-y-[-3px]" />
        <span className={`mono text-[10px] tracking-widest uppercase ${
          gen.status === 'completed' ? 'text-lime' :
          gen.status === 'failed' ? 'text-pink' :
          'text-cyan'
        }`}>
          /{gen.status}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-[2px] bg-border border border-border">
        {gen.avatars.map((a, i) => (
          <div
            key={a.id}
            className={`relative bg-surface aspect-[4/5] overflow-hidden flex flex-col justify-between p-3 transition-all ${
              a.selected ? 'outline outline-2 outline-lime outline-offset-[-2px]' : ''
            }`}
            style={
              a.status === 'done' && a.imageUrl
                ? { backgroundImage: `url(${a.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : undefined
            }
          >
            <span className="mono text-[9px] tracking-widest uppercase text-text-faint">
              /{(i + 1).toString().padStart(2, '0')}
            </span>
            <div className="relative z-[2] bg-[rgba(8,8,8,0.6)] p-2 -m-1">
              <div className="font-serif italic text-[15px] leading-tight">{a.styleLabel}</div>
              <div className="mono text-[8px] tracking-widest uppercase text-text-dim mt-1">
                {a.status === 'pending' && '/queued…'}
                {a.status === 'done' && '/ready'}
                {a.status === 'failed' && '/failed'}
              </div>
            </div>
            {a.status === 'done' && (
              <button
                onClick={() => onSelect(a.id)}
                disabled={selecting === a.id}
                className="absolute inset-0 w-full h-full opacity-0 hover:opacity-100 bg-[rgba(8,8,8,0.78)] flex items-center justify-center transition-opacity"
              >
                <span className="btn-primary">{a.selected ? 'Selected ✓' : 'Choose →'}</span>
              </button>
            )}
            {a.status === 'pending' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="mono text-[10px] tracking-widest text-cyan animate-pulse">/RENDER</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="mt-4 border border-lime/40 bg-[#0a1305] p-5 flex flex-wrap gap-4 items-center justify-between">
          <div>
            <div className="mono text-[10px] tracking-widest uppercase text-lime mb-1">/ selected</div>
            <div className="font-serif italic text-[22px]">{selected.styleLabel}</div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="btn-primary"
              href={`/videos/new?avatarId=${selected.id}`}
            >
              Создать видео →
            </Link>
            <Link
              className="btn-ghost"
              href={`/covers/new?avatarId=${selected.id}`}
            >
              Создать обложку →
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
