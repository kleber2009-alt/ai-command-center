'use client';

import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { CarouselAvatarOption, SlideShape } from './types';

type Props = {
  slides: SlideShape[];
  activeIndex: number;
  coverAvatar: CarouselAvatarOption | null;
  onSelect: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  hasErrorAt: (index: number) => boolean;
};

const slideRoleFor = (index: number, total: number) => {
  if (index === 0) return 'ОБЛОЖКА';
  if (index === total - 1) return 'CTA';
  return 'РАСКРЫТИЕ';
};

const roleColor = (role: string, active: boolean) => {
  if (active) return 'text-gold';
  if (role === 'ОБЛОЖКА') return 'text-lime';
  if (role === 'CTA') return 'text-pink';
  return 'text-text-dim';
};

/**
 * Левый рейл со списком слайдов. Внутри собственный scroll, страница не скроллится.
 * Активная карточка подсвечена лаймом, hover показывает контролы перестановки.
 */
export function SlidesRail({
  slides,
  activeIndex,
  coverAvatar,
  onSelect,
  onMove,
  onRemove,
  onAdd,
  hasErrorAt,
}: Props) {
  return (
    <aside className="panel flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border-soft px-4 py-3">
        <span className="label">
          Слайды · {slides.length}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={slides.length >= 20}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium text-gold transition-colors hover:bg-blue/10 disabled:opacity-30"
        >
          <Plus size={14} /> добавить
        </button>
      </header>

      <div className="overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border-2 [&::-webkit-scrollbar-thumb]:rounded">
        <ul className="grid gap-1 p-2">
          {slides.map((s, i) => {
            const active = i === activeIndex;
            const role = slideRoleFor(i, slides.length);
            const error = hasErrorAt(i);
            return (
              <li key={i}>
                <div
                  className={`group relative cursor-pointer rounded-2xl border transition-colors ${
                    active ? 'border-gold/50 bg-blue/[0.10]' : 'border-transparent hover:bg-white/[0.05]'
                  }`}
                  onClick={() => onSelect(i)}
                >
                  <div
                    className="flex items-stretch gap-3 p-2.5"
                  >
                    {/* Thumb */}
                    <div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-soft bg-white/[0.04]">
                      {i === 0 && coverAvatar?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coverAvatar.imageUrl}
                          alt={coverAvatar.styleLabel}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-[11px] font-semibold tabular-nums text-text-mute">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    {/* Title + role */}
                    <div className="grid gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${roleColor(
                            role,
                            active,
                          )}`}
                        >
                          {role}
                        </span>
                        {active && (
                          <span className="text-[11px] text-gold/80">
                            · редактируется
                          </span>
                        )}
                        {error && (
                          <span
                            className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-pink"
                            title="Пустой title или body"
                          />
                        )}
                      </div>
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-text">
                        {s.title || <span className="italic text-text-mute">Без заголовка</span>}
                      </p>
                    </div>
                  </div>

                  {/* Hover controls — right side */}
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(i, -1);
                      }}
                      disabled={i === 0}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-border-soft bg-bg/85 text-text-mute backdrop-blur hover:text-text disabled:opacity-20"
                      aria-label="Вверх"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(i, 1);
                      }}
                      disabled={i === slides.length - 1}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-border-soft bg-bg/85 text-text-mute backdrop-blur hover:text-text disabled:opacity-20"
                      aria-label="Вниз"
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(i);
                      }}
                      disabled={slides.length <= 2}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-border-soft bg-bg/85 text-text-mute backdrop-blur hover:text-danger disabled:opacity-20"
                      aria-label="Удалить"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
