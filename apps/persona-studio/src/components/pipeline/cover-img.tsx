'use client';

// Cover image that disappears when its URL is dead (Instagram / HeyGen CDN
// links expire), revealing whatever placeholder sits underneath.

import { useState } from 'react';

export function CoverImg({ src, className = '' }: { src: string; className?: string }) {
  const [dead, setDead] = useState(false);
  if (dead) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setDead(true)} className={className} />
  );
}
