// Scene switches of the style: a horizontal 3D cube (face ↔ split) and a zoom-through (split → face).
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {Background, clamp} from './core';

type Switch = {a: React.ReactNode; b: React.ReactNode; at: number; dur?: number};

// Cube: the whole frame turns left around the vertical axis, the next scene is the right face of the cube.
// The cube pulls back to ~0.86 at mid-turn and gets a motion blur, so its edges and the ember background show.
export const CubeSwitch: React.FC<Switch> = ({a, b, at, dur = T.dur.cube}) => {
  const f = useCurrentFrame();
  if (f < at) return <>{a}</>;
  if (f >= at + dur) return <>{b}</>;
  const p = interpolate(f, [at, at + dur], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const half = T.w / 2;
  const mid = Math.sin(p * Math.PI);
  const face = (node: React.ReactNode, deg: number) => (
    <AbsoluteFill
      style={{
        transform: `translateZ(${-half}px) rotateY(${deg}deg) translateZ(${half}px)`,
        backfaceVisibility: 'hidden',
        overflow: 'hidden',
        filter: `blur(${mid * 7}px) brightness(${1 - Math.abs(deg) / 300})`,
      }}
    >
      {node}
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{perspective: 2200, transform: `scale(${1 - mid * 0.14})`}}>
        <AbsoluteFill style={{transformStyle: 'preserve-3d'}}>
          {face(a, -90 * p)}
          {face(b, 90 - 90 * p)}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Zoom-through: the old scene flies into the camera with blur, the new one settles from 0.88 with blur.
export const ZoomSwitch: React.FC<Switch> = ({a, b, at, dur = T.dur.zoom}) => {
  const f = useCurrentFrame();
  if (f < at) return <>{a}</>;
  if (f >= at + dur) return <>{b}</>;
  const p = interpolate(f, [at, at + dur], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
  const q = interpolate(p, [0.3, 1], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{transform: `scale(${0.88 + 0.12 * q})`, filter: `blur(${(1 - q) * 12}px)`, opacity: q}}>{b}</AbsoluteFill>
      <AbsoluteFill style={{transform: `scale(${1 + p * 0.6})`, filter: `blur(${p * 16}px)`, opacity: 1 - p}}>{a}</AbsoluteFill>
    </AbsoluteFill>
  );
};
