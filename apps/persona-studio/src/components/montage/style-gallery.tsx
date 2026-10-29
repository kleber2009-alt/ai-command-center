'use client';

// Галерея стилей Студии Кадрика — витриной, как editing.ajenepinnock.com/#styles:
// группы «Рилсы (9:16)» / «Длинные видео и клипы (16:9)» / «Инструменты» со
// счётчиком, карточка = пример (видео играет, пока карточка на экране) +
// название с бейджем формата + описание. Клик выбирает стиль.

import { useEffect, useRef } from 'react';
import { Check, FileText, Lock, Sparkles } from 'lucide-react';
import { countLabel, kadrikGroups, kadrikRunnable, type KadrikStyle } from '@/lib/montage/kadrik-styles';

const GROUPS = kadrikGroups();

function SampleVideo({ s }: { s: KadrikStyle }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.45 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={s.video!}
      poster={s.poster ?? undefined}
      muted
      loop
      playsInline
      preload="none"
      aria-label={`Пример стиля «${s.name}», без звука`}
      className="block h-full w-full object-contain"
    />
  );
}

function Sample({ s }: { s: KadrikStyle }) {
  if (s.video) return <SampleVideo s={s} />;
  if (s.poster) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={s.poster} alt={`Пример стиля «${s.name}»`} loading="lazy" className="block h-full w-full object-cover" />;
  }
  // нет примера — плашка с сутью стиля
  const Icon = s.kind === 'content' ? FileText : Sparkles;
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_80%_at_50%_0%,rgba(31,123,255,0.28),transparent_60%)] p-6 text-center">
      <span className="grid justify-items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
          <Icon size={20} className="text-gold" />
        </span>
        <span className="text-[15px] font-semibold leading-tight text-text">{s.sub}</span>
      </span>
    </div>
  );
}

function StyleCard({ s, active, onPick }: { s: KadrikStyle; active: boolean; onPick: () => void }) {
  const runnable = kadrikRunnable(s);
  const wide = s.format === '16:9';
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!runnable}
      aria-pressed={active}
      title={runnable ? s.desc : 'Работает с папкой футажей на машине бота — запускай в Студии Кадрика'}
      className={`group relative overflow-hidden rounded-xl border bg-[#141416] text-left transition-[border-color,transform,box-shadow] duration-300 enabled:hover:-translate-y-1 disabled:cursor-not-allowed ${
        active ? 'border-gold shadow-[0_0_0_1px_var(--blue-bright),0_18px_40px_rgba(31,123,255,0.25)]' : 'border-white/10 enabled:hover:border-white/25'
      }`}
    >
      <div className={`relative overflow-hidden bg-[#1c1c1f] ${wide ? 'aspect-video' : s.format === 'text' ? 'aspect-[4/3]' : 'aspect-[9/16]'} ${runnable ? '' : 'opacity-50'}`}>
        <Sample s={s} />
        {active && (
          <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-blue text-white shadow-lg">
            <Check size={15} strokeWidth={3} />
          </span>
        )}
        {!runnable && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-text-dim">
            <Lock size={10} /> только в Кадрике
          </span>
        )}
      </div>
      <div className={wide ? 'px-[18px] pb-[18px] pt-4' : 'px-[13px] pb-[18px] pt-4 max-sm:px-2.5 max-sm:py-3'}>
        <div className="mb-[9px] flex flex-wrap items-center justify-between gap-2 max-sm:gap-1">
          <h4 className={`m-0 font-medium leading-tight text-text ${wide ? 'text-[14px]' : 'text-[12px] max-sm:text-[11px]'}`}>{s.name}</h4>
          <span className="rounded-[3px] border border-white/10 px-1 text-[9px] leading-[1.5] text-text-mute">
            {s.format === 'text' ? 'текст' : s.format}
          </span>
        </div>
        <p className={`line-clamp-3 leading-[1.7] text-text-mute ${wide ? 'text-[12px]' : 'text-[11px] max-sm:text-[10px]'}`}>{s.desc}</p>
      </div>
    </button>
  );
}

export function StyleGallery({
  value,
  onChange,
  only,
}: {
  value: string;
  onChange: (id: string) => void;
  /** show only matching styles (e.g. video-input ones in the pipeline wizard) */
  only?: (s: KadrikStyle) => boolean;
}) {
  const groups = only
    ? GROUPS.map((g) => ({ ...g, styles: g.styles.filter(only) })).filter((g) => g.styles.length > 0)
    : GROUPS;
  return (
    <div className="grid gap-[30px]">
      {groups.map((g) => {
        const wide = g.format === '16:9';
        return (
          <div key={g.key} className="grid gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-medium text-text max-sm:text-[12px]">
                {g.title}
                {g.format && <span className="ml-1.5 tabular-nums text-text-mute">({g.format})</span>}
              </h3>
              <span className="text-[13px] tabular-nums text-text-mute max-sm:text-[10px]">{countLabel(g.styles.length, g.noun)}</span>
            </div>
            <div
              className={`grid ${
                wide ? 'grid-cols-1 gap-[17px] sm:grid-cols-2 sm:gap-[15px]' : 'grid-cols-2 gap-3 md:grid-cols-3 md:gap-[18px] lg:grid-cols-4 lg:gap-[15px]'
              }`}
            >
              {g.styles.map((s) => (
                <StyleCard key={s.id} s={s} active={s.id === value} onPick={() => onChange(s.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
