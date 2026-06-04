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
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
      />

      {/* Panel */}
      <aside className="relative w-full max-w-md h-full bg-surface border-l border-border flex flex-col shadow-2xl">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gold" />
            <h2 className="mono text-[11px] tracking-widest uppercase text-text">
              История поиска
            </h2>
            {entries.length > 0 && (
              <span className="mono text-[10px] text-text-mute">({entries.length})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="btn-ghost text-[9px] tracking-widest uppercase text-pink"
              >
                Очистить
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="text-text-mute hover:text-text p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="px-5 py-16 text-center grid gap-2">
              <Clock className="w-6 h-6 text-text-mute mx-auto" />
              <p className="font-serif italic text-[15px] text-text-dim">
                Пока ничего не искали.
              </p>
              <p className="mono text-[10px] tracking-wider uppercase text-text-mute">
                Каждый поиск сохранится здесь автоматически
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border-soft">
              {entries.map((entry) => (
                <li key={entry.id} className="group">
                  <div className="flex items-start gap-2 px-5 py-3 hover:bg-bg/60">
                    <button
                      type="button"
                      onClick={() => onRestore(entry)}
                      className="flex-1 text-left grid gap-1"
                    >
                      <span className="font-serif text-[15px] text-text leading-snug">
                        {entry.niche}
                      </span>
                      <span className="mono text-[9px] tracking-wider uppercase text-text-mute flex flex-wrap gap-x-2 gap-y-0.5">
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
                      className="opacity-0 group-hover:opacity-100 text-text-mute hover:text-pink p-1 shrink-0"
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
