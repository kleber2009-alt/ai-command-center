// Frame-level building blocks: background, glowing card, face frame, captions, shine.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {T, Word} from '../tokens';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const ease = (f: number, from: number, dur: number) =>
  interpolate(f, [from, from + dur], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});

// Black with ember glow: strong under the face frame, faint in the top corners.
export const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: [
        `radial-gradient(120% 34% at 50% 104%, ${T.emberHot} 0%, ${T.ember} 38%, rgba(0,0,0,0) 72%)`,
        `radial-gradient(40% 16% at 0% 0%, rgba(90,20,0,0.55), rgba(0,0,0,0) 100%)`,
        `radial-gradient(40% 16% at 100% 0%, rgba(90,20,0,0.45), rgba(0,0,0,0) 100%)`,
        T.bg,
      ].join(', '),
    }}
  />
);

// Diagonal light streak across a card; starts at `at`, lasts T.dur.shine frames.
export const Shine: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + T.dur.shine], [-0.4, 1.4], clamp);
  if (f < at || f > at + T.dur.shine) return null;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
      <div
        style={{
          position: 'absolute',
          top: '-30%',
          left: `${p * 100}%`,
          width: 130,
          height: '160%',
          transform: 'translateX(-50%) rotate(24deg)',
          background:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,240,225,0.38) 45%, rgba(255,255,255,0.55) 50%, rgba(255,240,225,0.38) 55%, rgba(255,255,255,0) 100%)',
          filter: 'blur(6px)',
        }}
      />
    </AbsoluteFill>
  );
};

// Faint square grid inside cards.
const grid = `linear-gradient(${T.grid} 1px, transparent 1px), linear-gradient(90deg, ${T.grid} 1px, transparent 1px)`;

// Neon-edged card. `swapAt` = frame of a content change: content smears in with blur, then the shine runs.
export const GlowCard: React.FC<{
  box?: {x: number; y: number; w: number; h: number; r: number};
  label?: string;
  swapAt?: number;
  children?: React.ReactNode;
}> = ({box = T.card, label, swapAt = 0, children}) => {
  const f = useCurrentFrame();
  const p = ease(f, swapAt, T.dur.smear);
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: box.r,
        background: T.cardBg,
        backgroundImage: grid,
        backgroundSize: `${T.gridStep}px ${T.gridStep}px`,
        boxShadow: T.glow,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: interpolate(p, [0, 0.4, 1], [0, 0.8, 1]),
          filter: `blur(${(1 - p) * 14}px)`,
          transform: `translateX(${(1 - p) * -40}px) scaleX(${1 + (1 - p) * 0.08})`,
        }}
      >
        {label ? (
          <div style={{position: 'absolute', top: 30, width: '100%', textAlign: 'center', font: `600 28px ${T.font}`, color: T.sub}}>
            {label}
          </div>
        ) : null}
        {children}
      </div>
      <Shine at={swapAt + 3} />
    </div>
  );
};

// Bottom face frame of the split screen. Pass <OffthreadVideo/> or <Img/> as children.
export const FaceFrame: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div
    style={{
      position: 'absolute',
      left: T.face.x,
      top: T.face.y,
      width: T.face.w,
      height: T.face.h,
      borderRadius: T.face.r,
      boxShadow: T.glow,
      overflow: 'hidden',
      background: '#000',
    }}
  >
    {children}
  </div>
);

// Orange pill behind a keyword (split screen caption).
export const Pill: React.FC<{at: number; children: React.ReactNode; size?: number}> = ({at, children, size = T.caption.size}) => {
  const f = useCurrentFrame();
  const p = ease(f, at, T.dur.pill);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: `${size * 0.06}px ${size * 0.22}px ${size * 0.1}px`,
        borderRadius: size * 0.18,
        background: T.orange,
        opacity: p,
        transform: `scale(${0.82 + 0.18 * p})`,
        filter: `blur(${(1 - p) * 6}px)`,
      }}
    >
      {children}
    </span>
  );
};

const WordIn: React.FC<{w: Word; size: number}> = ({w, size}) => {
  const f = useCurrentFrame();
  if (f < w.at) return null;
  const p = ease(f, w.at, T.dur.word);
  const inner = w.hl ? <Pill at={w.at} size={size}>{w.text}</Pill> : w.text;
  return (
    <span
      style={{
        display: 'inline-block',
        marginRight: size * 0.26,
        opacity: w.hl ? 1 : p,
        filter: w.hl ? undefined : `blur(${(1 - p) * 8}px)`,
        transform: `translateY(${(1 - p) * 6}px)`,
      }}
    >
      {inner}
    </span>
  );
};

// One-line word-by-word caption between the card and the face. Words appear on their frames;
// the line is replaced by a hard cut when the next phrase starts (render a new <CaptionLine/>).
export const CaptionLine: React.FC<{words: Word[]; y?: number; size?: number}> = ({words, y = T.caption.y, size = T.caption.size}) => (
  <div
    style={{
      position: 'absolute',
      top: y - size * 0.75,
      width: '100%',
      textAlign: 'center',
      font: `800 ${size}px ${T.font}`,
      color: T.text,
      letterSpacing: -0.3,
      whiteSpace: 'nowrap',
    }}
  >
    {words.map((w, i) => (
      <WordIn key={i} w={w} size={size} />
    ))}
  </div>
);

// Full-screen face caption: UPPERCASE lines stacked from the top anchor, a line can sit on a red or white block.
export type FaceLine = {words: Word[]; block?: 'red' | 'white'};
export const FaceCaption: React.FC<{lines: FaceLine[]}> = ({lines}) => {
  const f = useCurrentFrame();
  const {top, size: base, lineH, maxW} = T.faceCaption;
  return (
    <div style={{position: 'absolute', top, width: '100%', textAlign: 'center'}}>
      {lines.map((l, i) => {
        if (f < l.words[0].at) return null;
        const bp = ease(f, l.words[0].at, T.dur.pill);
        // long lines shrink to fit the width (~0.7 em per uppercase Montserrat Black glyph)
        const chars = l.words.map((x) => x.text).join(' ').length;
        const size = Math.min(base, Math.floor(maxW / (chars * 0.7)));
        const white = l.block === 'white';
        return (
          <div key={i} style={{height: lineH, display: 'flex', justifyContent: 'center'}}>
            <span
              style={{
                display: 'inline-block',
                font: `900 ${size}px ${T.font}`,
                lineHeight: `${lineH}px`,
                color: white ? '#0A0A0A' : T.text,
                textTransform: 'uppercase',
                letterSpacing: -1,
                padding: l.block ? `0 ${size * 0.16}px` : 0,
                background: l.block ? (white ? T.text : T.red) : 'transparent',
                opacity: l.block ? bp : 1,
                textShadow: l.block ? 'none' : '0 3px 18px rgba(0,0,0,0.55)',
                whiteSpace: 'nowrap',
              }}
            >
              {l.words.map((w, j) => (
                <WordIn key={j} w={{...w, hl: false}} size={size} />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Small legal line Instagram reels in RU carry at the bottom of face shots.
export const MetaDisclaimer: React.FC = () => (
  <div style={{position: 'absolute', bottom: 150, width: '100%', textAlign: 'center', font: `500 17px ${T.font}`, color: 'rgba(255,255,255,0.35)', lineHeight: 1.3}}>
    Meta признана экстремистской организацией
    <br />и запрещена на территории РФ
  </div>
);
