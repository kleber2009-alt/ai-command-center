'use client';

// Страница «Медиа» — post-level витрина над ResearchReel (ТЗ «Медиа», §5).
// Поиск по ключевым словам + фильтры (тип / период / виральность / блогер /
// избранное), сортировки, виды «Карточки / Таблица», keyset-пагинация
// (бесконечный скролл), счётчик «Найдено», скрытие постов (локальное, до
// перезагрузки — ТЗ §3.5). Данные тянет из GET /api/research/media.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ResearchReelCard } from './research-reel-card';
import { ResearchTable } from './research-table';
import type { ResearchReelView } from './types';

type MediaReel = ResearchReelView & { isFav: boolean };

type Sort = 'xn' | 'views' | 'likes' | 'recent';
type TypeFilter = 'all' | 'reel' | 'post' | 'carousel';
type Period = 'all' | '1' | '7' | '30';

type Filters = {
  q: string;
  sort: Sort;
  type: TypeFilter;
  period: Period;
  viral: number;
  blogger: string;
  fav: boolean;
};

const DEFAULT_FILTERS: Filters = {
  q: '',
  sort: 'xn',
  type: 'all',
  period: 'all',
  viral: 0,
  blogger: '',
  fav: false,
};

const SORT_OPTS: Array<{ v: Sort; label: string }> = [
  { v: 'xn', label: 'Виральность' },
  { v: 'views', label: 'Просмотры' },
  { v: 'likes', label: 'Лайки' },
  { v: 'recent', label: 'Свежие' },
];
const TYPE_OPTS: Array<{ v: TypeFilter; label: string }> = [
  { v: 'all', label: 'Все' },
  { v: 'reel', label: 'Reels' },
  { v: 'post', label: 'Посты' },
  { v: 'carousel', label: 'Карусели' },
];
const PERIOD_OPTS: Array<{ v: Period; label: string }> = [
  { v: 'all', label: 'Всё время' },
  { v: '1', label: '24 ч' },
  { v: '7', label: '7 дней' },
  { v: '30', label: '30 дней' },
];
const VIRAL_OPTS: Array<{ v: number; label: string }> = [
  { v: 0, label: 'Любая' },
  { v: 1, label: '≥1×' },
  { v: 2, label: '≥2×' },
  { v: 5, label: '≥5×' },
];

function buildQuery(f: Filters, cursor: string | null): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  p.set('sort', f.sort);
  if (f.type !== 'all') p.set('type', f.type);
  if (f.period !== 'all') p.set('period', f.period);
  if (f.viral > 0) p.set('viral', String(f.viral));
  if (f.blogger.trim()) p.set('blogger', f.blogger.trim());
  if (f.fav) p.set('fav', 'true');
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

const fmtCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

export function MediaClient() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState(''); // raw input, debounced into filters.q
  const [view, setView] = useState<'cards' | 'table'>('cards');

  const [items, setItems] = useState<MediaReel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countMode, setCountMode] = useState<'exact' | 'estimated'>('exact');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Дебаунс строки поиска 300 мс (ТЗ §5).
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: search })), 300);
    return () => clearTimeout(t);
  }, [search]);

  // requestId защищает от гонки ответов при быстром переключении фильтров.
  const reqRef = useRef(0);

  const fetchPage = useCallback(
    async (f: Filters, cur: string | null) => {
      const rid = ++reqRef.current;
      const more = Boolean(cur);
      if (more) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/research/media?${buildQuery(f, cur)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (rid !== reqRef.current) return; // устаревший ответ
        setItems((prev) => (more ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor ?? null);
        setCount(data.count ?? null);
        setCountMode(data.countMode ?? 'exact');
      } catch (e) {
        if (rid !== reqRef.current) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить');
      } finally {
        if (rid === reqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Сброс выдачи при смене любого фильтра.
  useEffect(() => {
    fetchPage(filters, null);
  }, [filters, fetchPage]);

  const visible = items.filter((r) => !hidden.has(r.id));

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setSearch('');
    setFilters(DEFAULT_FILTERS);
  }

  function hide(id: string) {
    setHidden((s) => new Set(s).add(id));
  }

  return (
    <div className="grid gap-5">
      {/* ── Header ── */}
      <header className="grid gap-1">
        <h1 className="font-serif text-2xl text-text">Медиа</h1>
        <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
          Поиск контента по постам · фильтры виральности и ниши
        </p>
      </header>

      {/* ── Search ── */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Ключевые слова · поддержка "фраз" и -исключений'
          className="flex-1 bg-surface border border-border px-3 py-2 font-serif text-[14px] text-text placeholder:text-text-mute focus:border-gold outline-none"
        />
        <button
          type="button"
          onClick={() => setView(view === 'cards' ? 'table' : 'cards')}
          className="px-3 py-2 border border-border mono text-[10px] tracking-widest uppercase text-text hover:border-gold"
          title="Переключить вид"
        >
          {view === 'cards' ? 'Таблица' : 'Карточки'}
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="grid gap-2 border border-border-soft bg-surface p-3">
        <FilterRow label="Сорт.">
          {SORT_OPTS.map((o) => (
            <Chip key={o.v} active={filters.sort === o.v} onClick={() => update('sort', o.v)}>
              {o.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Тип">
          {TYPE_OPTS.map((o) => (
            <Chip key={o.v} active={filters.type === o.v} onClick={() => update('type', o.v)}>
              {o.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Период">
          {PERIOD_OPTS.map((o) => (
            <Chip key={o.v} active={filters.period === o.v} onClick={() => update('period', o.v)}>
              {o.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Вирал.">
          {VIRAL_OPTS.map((o) => (
            <Chip key={o.v} active={filters.viral === o.v} onClick={() => update('viral', o.v)}>
              {o.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Блогер">
          <input
            type="text"
            value={filters.blogger}
            onChange={(e) => update('blogger', e.target.value)}
            placeholder="@username"
            className="bg-bg border border-border px-2 py-1 mono text-[11px] text-text placeholder:text-text-mute focus:border-gold outline-none w-44"
          />
          <Chip active={filters.fav} onClick={() => update('fav', !filters.fav)}>
            ♥ Избранное
          </Chip>
          <button
            type="button"
            onClick={reset}
            className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text underline"
          >
            Сбросить
          </button>
        </FilterRow>
      </div>

      {/* ── Count ── */}
      <div className="mono text-[11px] tracking-widest uppercase text-text-mute">
        {count != null && (
          <span>
            Найдено: {countMode === 'estimated' ? '~' : ''}
            {fmtCount(count)}
            {hidden.size > 0 && ` · скрыто ${hidden.size}`}
          </span>
        )}
      </div>

      {/* ── Results ── */}
      {error ? (
        <div className="border border-pink/40 bg-surface p-6 text-center grid gap-2">
          <p className="mono text-[11px] tracking-widest uppercase text-pink">Ошибка</p>
          <p className="font-serif text-[13px] text-text-dim">{error}</p>
          <button
            type="button"
            onClick={() => fetchPage(filters, null)}
            className="mono text-[10px] tracking-widest uppercase text-text hover:text-gold underline justify-self-center"
          >
            Повторить
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border border-border bg-surface aspect-[3/4] animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-border-soft bg-surface p-10 text-center grid gap-2">
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">Ничего не найдено</p>
          <p className="font-serif text-[13px] text-text-dim">
            Измени запрос или ослабь фильтры. Контент появляется по мере индексации
            блогеров и нишевого ресёрча.
          </p>
        </div>
      ) : view === 'table' ? (
        <ResearchTable reels={visible} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {visible.map((r) => (
            <div key={r.id} className="relative group">
              <ResearchReelCard reel={r} initialFavorited={r.isFav} />
              <button
                type="button"
                onClick={() => hide(r.id)}
                title="Скрыть пост"
                aria-label="hide"
                className="absolute top-2 right-9 z-10 px-1.5 py-1 bg-black/80 border border-border hover:border-pink mono text-[10px] text-text opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Load more (keyset) ── */}
      {!loading && cursor && visible.length > 0 && (
        <button
          type="button"
          onClick={() => fetchPage(filters, cursor)}
          disabled={loadingMore}
          className="justify-self-center px-6 py-2 border border-border mono text-[11px] tracking-widest uppercase text-text hover:border-gold disabled:opacity-50"
        >
          {loadingMore ? 'Загрузка…' : 'Показать ещё'}
        </button>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute w-14 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 border mono text-[10px] tracking-widest uppercase transition-colors ${
        active ? 'border-gold text-gold bg-gold/5' : 'border-border text-text-dim hover:border-text'
      }`}
    >
      {children}
    </button>
  );
}
