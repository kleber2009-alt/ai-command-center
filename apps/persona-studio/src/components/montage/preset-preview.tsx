'use client';

// Живое превью стиля монтажа: мини-кадр, где хук-титр, пословные субтитры и
// призыв проигрываются по правилам пресета (mode / entry / accent / plate /
// activeColor / зум-панч) — так же, как их рисует ffmpeg + ASS в src/lib/montage.
// Кадр считается из времени t, поэтому играет только наведённая/выбранная
// карточка (requestAnimationFrame), остальные показывают статичный кадр.

import { useEffect, useState, type CSSProperties } from 'react';
import { presetStyle, type MontagePreset } from '@/lib/montage/presets';

/** демо-фраза; слово в звёздочках — акцент, как в хук-титре */
const DEMO = ['монтаж', 'рилсов', '*кодом*', 'без', 'монтажёра'];
const HOOK_END = 1.1;
const WORDS_AT = 0.9;
const STEP = 0.36;
const CTA_AT = WORDS_AT + DEMO.length * STEP + 0.6;
const LOOP = CTA_AT + 1.5;
/** статичный кадр: акцентное слово только что произнесено */
const STILL_T = WORDS_AT + 2 * STEP + 0.5;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function applyCase(w: string, c: MontagePreset['capCase']): string {
  return c === 'upper' ? w.toUpperCase() : c === 'lower' ? w.toLowerCase() : w;
}

/** transform/opacity/filter слова через `since` секунд после входа */
/** promo-story: каждое слово влетает со своей стороны [dx, dy, rot] */
const FLY_FROM: [number, number, number][] = [[-120, 30, -8], [110, -40, 6], [0, 90, -4], [-90, -70, 5], [130, 50, -6]];

function entryStyle(entry: NonNullable<MontagePreset['entry']>, since: number, k: number, i = 0): CSSProperties {
  switch (entry) {
    case 'fly': {
      const p = easeOut(since / 0.23);
      const [dx, dy, rot] = FLY_FROM[i % FLY_FROM.length];
      return {
        opacity: clamp(since / 0.08),
        transform: `translate(${(1 - p) * dx * k}px, ${(1 - p) * dy * k}px) rotate(${(1 - p) * rot}deg)`,
        filter: `blur(${(1 - p) * 16 * k}px)`,
      };
    }
    case 'blur-slide': {
      const p = easeOut(since / 0.133);
      return { opacity: p, transform: `translateX(${(1 - p) * 18 * k}px)`, filter: `blur(${(1 - p) * 6 * k}px)` };
    }
    case 'rise': {
      const p = easeOut(since / 0.3);
      return {
        opacity: p,
        transform: `translateY(${(1 - p) * 28 * k}px) scale(${0.92 + 0.08 * p})`,
        filter: `blur(${(1 - p) * 14 * k}px)`,
      };
    }
    case 'scale-blur': {
      const p = easeOut(since / 0.167);
      return { opacity: p, transform: `scale(${1.35 - 0.35 * p})`, filter: `blur(${(1 - p) * 12 * k}px)` };
    }
    default: {
      const p = easeOut(since / 0.12);
      return { opacity: clamp(since / 0.06), transform: `scale(${1.25 - 0.25 * p})` };
    }
  }
}

function usePlayhead(playing: boolean): number {
  const [t, setT] = useState(STILL_T);
  useEffect(() => {
    if (!playing) {
      setT(STILL_T);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setT(((now - start) / 1000) % LOOP);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return t;
}

export function PresetPreview({ preset, playing }: { preset: MontagePreset; playing: boolean }) {
  const t = usePlayhead(playing);
  const s = presetStyle(preset);
  const wide = preset.format === '16:9';
  // кадр 1080 / 1920 px ужат до полосы карточки
  const k = wide ? 0.18 : 0.25;
  const entry = preset.entry ?? 'pop';

  const size = Math.max(Math.min(preset.words[1], 3), 1);
  const groupSize = preset.mode === 'pop' ? size : Math.min(preset.words[1], DEMO.length);
  const groups: number[][] = [];
  for (let i = 0; i < DEMO.length; i += groupSize) groups.push(DEMO.slice(i, i + groupSize).map((_, j) => i + j));
  const wordAt = (i: number) => WORDS_AT + i * STEP;
  let gi = -1;
  groups.forEach((g, i) => {
    if (wordAt(g[0]) - (preset.lead ?? 0) <= t) gi = i;
  });
  const showCaps = t >= WORDS_AT - (preset.lead ?? 0) && t < CTA_AT && gi >= 0;
  const group = showCaps ? groups[gi] : [];

  const punch = preset.punchZoom ?? 1.08;
  const bgScale = showCaps && gi % 2 === 1 ? punch : 1;

  const shadow = preset.shadowOnly
    ? `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.55)`
    : '0 0 2px rgba(0,0,0,.9), 0 1px 3px rgba(0,0,0,.8)';
  const pill = preset.id === 'uimotion' || preset.id === 'promoface';

  function word(i: number) {
    const raw = DEMO[i];
    const accent = raw.startsWith('*');
    const text = applyCase(raw.replace(/\*/g, ''), preset.capCase);
    const spokenAt = wordAt(i);
    let style: CSSProperties = { display: 'inline-block', color: preset.capColor, whiteSpace: 'pre' };

    if (preset.mode === 'pop') {
      style = { ...style, ...entryStyle(entry, t - wordAt(group[0]), k) };
    } else if (preset.mode === 'karaoke') {
      style = { ...style, ...entryStyle('pop', t - wordAt(group[0]), k), ...(t < spokenAt ? { opacity: 0.35 } : null) };
    } else {
      const appear = spokenAt - (preset.lead ?? 0);
      if (t < appear) return <span key={i} style={{ ...style, opacity: 0 }}>{text}</span>;
      style = { ...style, ...entryStyle(entry, t - appear, k, i) };
      if (preset.activeColor && !accent) style.color = mixHex(preset.activeColor, preset.capColor, clamp((t - spokenAt) / 0.47));
    }

    if (accent) {
      if (preset.accent === 'box') {
        style = {
          ...style,
          background: s.accent,
          color: s.accentInk,
          padding: `0 ${0.22}em`,
          borderRadius: pill ? 999 : '0.18em',
          textShadow: 'none',
        };
      } else if (preset.accent === 'italic') {
        style = { ...style, color: s.accent, fontFamily: `'${s.accentFont ?? 'Playfair 700 Italic'}', serif`, fontStyle: 'italic' };
      } else {
        style = { ...style, color: s.accent };
        if (s.accentMode === 'glow') style.textShadow = `0 0 ${14 * k}px ${s.accent}, ${shadow}`;
      }
    }
    return (
      <span key={i} style={style}>
        {text}
      </span>
    );
  }

  const top = preset.capY < (wide ? 540 : 960);
  const hookIn = easeOut(t / 0.3);
  const hookOut = clamp((HOOK_END - t) / 0.2);
  const ctaIn = t - CTA_AT;

  return (
    <div
      className="relative h-[112px] overflow-hidden rounded-xl border border-border-soft"
      // монтаж идёт поверх видео автора — кадр тёмный, стиль даёт только оттенок
      style={{ background: `linear-gradient(160deg, ${s.darkBg}55, #0A0A0C 70%)` }}
      aria-hidden
    >
      {/* фон: узор стиля + зум-панч на склейках */}
      <div
        className="absolute inset-0 transition-transform duration-150 ease-out"
        style={{
          transform: `scale(${bgScale})`,
          background:
            s.pattern === 'grid'
              ? `linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px) 0 0 / 18px 18px, linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px) 0 0 / 18px 18px`
              : s.pattern === 'wallpaper'
                ? `radial-gradient(120% 90% at 20% 0%, ${s.accent}55, transparent 60%), radial-gradient(90% 80% at 100% 100%, ${s.accent2 ?? s.accent}40, transparent 60%)`
                : `radial-gradient(80% 70% at 50% 30%, rgba(255,255,255,.10), transparent 70%)`,
        }}
      />
      {/* «говорящая голова»-заглушка */}
      <div
        className="absolute left-1/2 top-[18%] h-[120%] w-[34%] -translate-x-1/2 rounded-t-full opacity-[0.10]"
        style={{ background: 'linear-gradient(#fff, transparent)' }}
      />

      {/* хук-титр */}
      {t < HOOK_END && (
        <div
          className="absolute inset-x-0 top-2.5 px-3 text-center leading-tight"
          style={{
            fontFamily: `'${preset.capFont}', system-ui, sans-serif`,
            fontSize: 13,
            color: '#fff',
            opacity: hookIn * hookOut,
            transform: `translateY(${(1 - hookIn) * 8}px)`,
            filter: `blur(${(1 - hookIn) * 4}px)`,
            textShadow: shadow,
          }}
        >
          {applyCase('монтаж ', preset.capCase)}
          <span style={{ color: s.accent }}>{applyCase('кодом', preset.capCase)}</span>
        </div>
      )}

      {/* субтитры */}
      {showCaps && (
        <div
          className={`absolute inset-x-0 flex justify-center px-3 ${top ? 'top-[30%]' : 'bottom-3'}`}
          style={{
            fontFamily: `'${preset.capFont}', system-ui, sans-serif`,
            fontSize: Math.min(Math.round(preset.capSize * k), 20),
            lineHeight: 1.15,
            textShadow: shadow,
          }}
        >
          <span
            className="inline-flex flex-wrap justify-center gap-x-[0.26em] gap-y-0.5 text-center"
            style={preset.plate ? { background: preset.plate, padding: '0.08em 0.3em', borderRadius: 4 } : undefined}
          >
            {group.map(word)}
          </span>
        </div>
      )}

      {/* призыв «пиши «слово»» */}
      {ctaIn >= 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <span
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{
              fontFamily: `'${preset.capFont}', system-ui, sans-serif`,
              background: 'rgba(255,255,255,.1)',
              color: '#fff',
              ...entryStyle('pop', ctaIn, k),
            }}
          >
            {preset.ctaVerb}
            <span className="rounded-full px-2 py-0.5" style={{ background: s.accent, color: s.accentInk }}>
              «ГАЙД»
            </span>
          </span>
        </div>
      )}

      <span className="absolute right-2 top-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] tabular-nums text-white/70">
        {preset.format}
      </span>
    </div>
  );
}
