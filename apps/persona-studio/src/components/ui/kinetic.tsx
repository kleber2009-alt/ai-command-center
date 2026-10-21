import type { ReactNode } from 'react';

/**
 * Kinetic headline (reels-ui-motion Headline): every word rises out of a blur
 * one after another, 100 ms apart. Pure CSS (globals.css .kinetic-word), so it
 * works in server components. Non-string children just fade in as a block.
 */
export function Kinetic({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  if (typeof children !== 'string') {
    return (
      <span className="reveal inline-block" style={{ ['--i' as string]: delay } as React.CSSProperties}>
        {children}
      </span>
    );
  }
  const words = children.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className="kinetic-word" style={{ ['--i' as string]: delay + i } as React.CSSProperties}>
            {w}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </>
  );
}
