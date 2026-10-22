'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
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
      className="pop-in absolute right-0 top-full z-20 mt-2 w-[min(90vw,360px)] overflow-hidden rounded-[20px] border border-border-2 bg-bg-card/95 shadow-glass backdrop-blur-xl"
    >
      <header className="flex items-center justify-between border-b border-border-soft px-4 py-2.5">
        <span className="label">
          Выбери фото · {avatars.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-dim transition-colors hover:bg-white/[0.08] hover:text-text"
          aria-label="Закрыть"
        >
          <X size={14} />
        </button>
      </header>

      {avatars.length === 0 ? (
        <div className="p-4 text-[13px] text-text-mute">
          У тебя нет готовых аватаров — сначала сделай хотя бы один в «Аватаре».
        </div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto p-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border-2">
          <div className="grid grid-cols-4 gap-1.5">
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
                  className={`relative aspect-[3/4] overflow-hidden rounded-xl bg-white/[0.04] transition ${
                    isSelected ? 'ring-2 ring-gold' : 'ring-1 ring-transparent hover:ring-border-2'
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
                    <span className="absolute bottom-1 right-1 rounded-full bg-blue px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                      обложка
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
