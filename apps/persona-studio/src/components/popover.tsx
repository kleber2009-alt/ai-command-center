'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  width?: number;
  children: ReactNode;
};

/**
 * Лёгкий popover на анкоре. Без портала — рендерится в DOM рядом с анкорой.
 * Закрывается по Esc и клику вне popover/anchor. Позиционирование:
 * под анкором, выравнивание `align` (по горизонтали).
 */
export function Popover({ open, onClose, anchorRef, align = 'right', width = 320, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Esc + click-outside
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      if (anchorRef.current && anchorRef.current.contains(target)) return;
      onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const sideClasses = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div
      ref={ref}
      className={`absolute z-50 top-[calc(100%+6px)] ${sideClasses} bg-bg border border-border-2 shadow-2xl`}
      style={{ width }}
      role="dialog"
    >
      {children}
    </div>
  );
}
