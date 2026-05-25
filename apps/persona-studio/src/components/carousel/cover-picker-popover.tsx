'use client';

import { useEffect, useRef } from 'react';
import type { CarouselAvatarOption } from './types';

type Props = {
  open: boolean;
  avatars: CarouselAvatarOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
};

/**
 * Поповер с галереей аватаров для слайда 01. Закрывается по Esc и клику вне.
 * Позиционируется absolute относительно родителя — кнопка-якорь должна быть
 * в relative-контейнере.
 */
export function CoverPickerPopover({ open, avatars, selectedId, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // delay attach to avoid catching the click that opened it
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      className="absolute top-full right-0 mt-2 z-20 w-[min(90vw,360px)] bg-[#0f0f0f] border border-border-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
    >
      <header className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">
          Выбери фото · {avatars.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="mono text-[12px] text-text-dim hover:text-text leading-none w-6 h-6 flex items-center justify-center"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </header>

      {avatars.length === 0 ? (
        <div className="p-4 mono text-[11px] text-text-mute">
          У тебя нет готовых аватаров — сначала сделай хотя бы один в /generate.
        </div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto p-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border-2">
          <div className="grid grid-cols-4 gap-1">
            {avatars.map((a) => {
              const isSelected = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onSelect(a.id);
                    onClose();
                  }}
                  className={`relative aspect-[3/4] overflow-hidden bg-bg transition ${
                    isSelected ? 'ring-2 ring-lime' : 'border border-transparent hover:border-text-dim'
                  }`}
                  title={a.styleLabel}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.imageUrl}
                    alt={a.styleLabel}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isSelected && (
                    <span className="absolute bottom-0.5 right-0.5 px-1 mono text-[7px] tracking-widest uppercase bg-lime text-black">
                      cover
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
