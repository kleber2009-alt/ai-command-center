'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  placement?: 'bottom' | 'top' | 'auto';
  width?: number;
  children: ReactNode;
};

/**
 * Лёгкий popover на анкоре. Без портала — рендерится в DOM рядом с анкорой.
 * Закрывается по Esc и клику вне popover/anchor. Позиционирование:
 * под анкором, выравнивание `align` (по горизонтали).
 */
export function Popover({ open, onClose, anchorRef, align = 'right', placement = 'auto', width = 320, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [flipUp, setFlipUp] = useState(false);

  // Auto-decide placement: если ниже карточки меньше 320px до viewport bottom — flip вверх.
  useEffect(() => {
    if (!open) return;
    if (placement === 'bottom') {
      setFlipUp(false);
      return;
    }
    if (placement === 'top') {
      setFlipUp(true);
      return;
    }
    // 'auto'
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setFlipUp(spaceBelow < 320);
  }, [open, placement, anchorRef]);

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
  const verticalClasses = flipUp ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]';

  return (
    <div
      ref={ref}
      className={`absolute z-50 ${verticalClasses} ${sideClasses} bg-bg border border-border-2 shadow-2xl`}
      style={{ width }}
      role="dialog"
    >
      {children}
    </div>
  );
}
