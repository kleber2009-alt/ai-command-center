'use client';

// Слайд-овер «История» — список прошлых поисков из localStorage. Клик по
// записи восстанавливает её выдачу мгновенно (без повторного скрейпа).

import { useEffect } from 'react';
import { Clock, History, Trash2, X } from 'lucide-react';
import type { SearchHistoryEntry } from './search-history';
import type { Period, SortField } from './types';

const PERIOD_LABEL: Record<Period, string> = {
  all: 'за всё время',
  '7d': '7 дней',
  '30d': '30 дней',
  '90d': '90 дней',
};

const SORT_LABEL: Record<SortField, string> = {
  viral_score: 'виральный счёт',
  views: 'просмотры',
  virality: 'виральность',
  engagement: 'вовлечённость',
  date: 'дата',
};

function relativeTime(at: number): string {
  const diff = Date.now() - at;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} д назад`;
  return new Date(at).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export function SearchHistoryDrawer({
  open,
  entries,
  onClose,
  onRestore,
  onRemove,
  onClear,
}: {
  open: boolean;
  entries: SearchHistoryEntry[];
  onClose: () => void;
  onRestore: (entry: SearchHistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm fade-in"
      />

      {/* Panel */}
      <aside className="relative m-2 flex h-[calc(100%-16px)] w-full max-w-md flex-col overflow-hidden rounded-[24px] border border-border-soft bg-surface/95 shadow-glass backdrop-blur-2xl reveal">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue/15">
              <History className="w-4 h-4 text-gold" />
            </span>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-text">
              История поиска
            </h2>
            {entries.length > 0 && (
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[12px] tabular-nums text-text-mute">{entries.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="btn-ghost !px-3.5 !py-1.5 !text-[12px] !text-pink"
              >
                Очистить
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="btn-icon !h-8 !w-8"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <div className="px-5 py-16 flex flex-col items-center text-center gap-2">
              <Clock className="w-7 h-7 text-text-mute" />
              <p className="text-[15px] font-medium text-text-dim">
                Пока ничего не искали.
              </p>
              <p className="text-[12px] text-text-mute">
                Каждый поиск сохранится здесь автоматически
              </p>
            </div>
          ) : (
            <ul className="grid gap-1 stagger">
              {entries.map((entry) => (
                <li key={entry.id} className="group">
                  <div className="flex items-start gap-2 rounded-2xl px-4 py-3 transition-colors hover:bg-white/[0.05]">
                    <button
                      type="button"
                      onClick={() => onRestore(entry)}
                      className="flex-1 text-left grid gap-1"
                    >
                      <span className="text-[15px] font-medium text-text leading-snug">
                        {entry.niche}
                      </span>
                      <span className="text-[12px] text-text-mute flex flex-wrap gap-x-2 gap-y-0.5">
                        <span className="text-gold">{entry.count} рилсов</span>
                        <span>· {PERIOD_LABEL[entry.period]}</span>
                        <span>· {SORT_LABEL[entry.sortBy]}</span>
                        <span>· {relativeTime(entry.at)}</span>
                        {entry.cacheHit && <span className="text-lime">· кэш</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Удалить из истории"
                      onClick={() => onRemove(entry.id)}
                      className="btn-icon !h-8 !w-8 shrink-0 opacity-0 group-hover:opacity-100 hover:!text-pink"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
