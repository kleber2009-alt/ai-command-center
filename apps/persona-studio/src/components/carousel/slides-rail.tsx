'use client';

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
  if (active) return 'text-lime';
  if (role === 'ОБЛОЖКА') return 'text-lime/70';
  if (role === 'CTA') return 'text-warm';
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
    <aside className="border border-border bg-surface flex flex-col h-full overflow-hidden">
      <header className="flex items-center justify-between px-3 py-3 border-b border-border shrink-0">
        <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">
          Слайды · {slides.length}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={slides.length >= 20}
          className="mono text-[10px] tracking-[0.18em] uppercase text-lime hover:underline disabled:opacity-30"
        >
          + добавить
        </button>
      </header>

      <div className="overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border-2 [&::-webkit-scrollbar-thumb]:rounded">
        <ul className="grid gap-px bg-border">
          {slides.map((s, i) => {
            const active = i === activeIndex;
            const role = slideRoleFor(i, slides.length);
            const error = hasErrorAt(i);
            return (
              <li key={i} className="bg-surface">
                <div
                  className={`relative group cursor-pointer transition-colors ${
                    active ? 'bg-lime/[0.04]' : 'hover:bg-surface-hover'
                  }`}
                  onClick={() => onSelect(i)}
                >
                  <div
                    className={`flex items-stretch gap-3 p-2.5 border-l-2 ${
                      active ? 'border-lime' : 'border-transparent'
                    }`}
                  >
                    {/* Thumb */}
                    <div className="w-9 h-14 shrink-0 bg-bg border border-border overflow-hidden flex items-center justify-center">
                      {i === 0 && coverAvatar?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coverAvatar.imageUrl}
                          alt={coverAvatar.styleLabel}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="mono text-[9px] tracking-wider text-text-mute">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    {/* Title + role */}
                    <div className="grid gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`mono text-[9px] tracking-[0.18em] uppercase ${roleColor(
                            role,
                            active,
                          )}`}
                        >
                          {role}
                        </span>
                        {active && (
                          <span className="mono text-[8px] tracking-wider text-lime/70">
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
                      <p className="font-serif text-[13px] leading-tight text-text line-clamp-2">
                        {s.title || <span className="italic text-text-mute">Без заголовка</span>}
                      </p>
                    </div>
                  </div>

                  {/* Hover controls — right side */}
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(i, -1);
                      }}
                      disabled={i === 0}
                      className="w-6 h-6 mono text-[10px] text-text-mute hover:text-text bg-bg/80 border border-border disabled:opacity-20"
                      aria-label="Вверх"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(i, 1);
                      }}
                      disabled={i === slides.length - 1}
                      className="w-6 h-6 mono text-[10px] text-text-mute hover:text-text bg-bg/80 border border-border disabled:opacity-20"
                      aria-label="Вниз"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(i);
                      }}
                      disabled={slides.length <= 2}
                      className="w-6 h-6 mono text-[10px] text-text-mute hover:text-pink bg-bg/80 border border-border disabled:opacity-20"
                      aria-label="Удалить"
                    >
                      ✕
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
