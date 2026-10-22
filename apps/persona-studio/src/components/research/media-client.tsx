'use client';

// Страница «Медиа» — post-level витрина над виральным ресёрчем.
//
// Два режима:
//   • SEARCH (введено ключевое слово + нажата «Поиск») — ЖИВОЙ запрос к
//     Instagram через POST /api/research/search (Apify reels-search → индексация
//     авторов → метрики → ранжирование). Каждое новое ключевое слово =
//     новый глобальный поиск по всему Instagram, а не по локальной базе.
//   • BROWSE (поле пустое) — витрина по уже накопленной базе через
//     GET /api/research/media (keyset-пагинация, серверные фильтры).
//
// В режиме SEARCH фильтры (тип / период / виральность / блогер / сортировка)
// применяются КЛИЕНТ-САЙД к уже полученной выдаче — смена чипа не дёргает
// Apify повторно (защита кредитов). Новый запрос к Instagram — только по
// кнопке «Поиск» (новое ключевое слово) или Enter.

import { useCallback, useEffect, useRef, useState } from 'react';
import { EyeOff, Heart, LayoutGrid, RefreshCw, Search, Table2, X } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { PageHero } from '@/components/shell/page-hero';
import { ResearchReelCard } from './research-reel-card';
import { ResearchTable } from './research-table';
import type { ResearchReelView } from './types';
import { errorText } from '@/lib/error-text';

type MediaReel = ResearchReelView & { isFav: boolean };

type Sort = 'xn' | 'views' | 'likes' | 'recent';
type TypeFilter = 'all' | 'reel' | 'post' | 'carousel';
type Period = 'all' | '1' | '7' | '30';

type Filters = {
  sort: Sort;
  type: TypeFilter;
  period: Period;
  viral: number;
  blogger: string;
  fav: boolean;
};

const DEFAULT_FILTERS: Filters = {
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

const PERIOD_DAYS: Record<string, number> = { '1': 1, '7': 7, '30': 30 };

// Browse-режим: серверный запрос к локальной базе.
function buildBrowseQuery(f: Filters, cursor: string | null): string {
  const p = new URLSearchParams();
  p.set('sort', f.sort);
  if (f.type !== 'all') p.set('type', f.type);
  if (f.period !== 'all') p.set('period', f.period);
  if (f.viral > 0) p.set('viral', String(f.viral));
  if (f.blogger.trim()) p.set('blogger', f.blogger.trim());
  if (f.fav) p.set('fav', 'true');
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

// Search-режим: клиент-сайд сортировка по выбранному критерию.
function sortReels(list: MediaReel[], sort: Sort): MediaReel[] {
  const arr = [...list];
  arr.sort((a, b) => {
    switch (sort) {
      case 'views': return (b.views || 0) - (a.views || 0);
      case 'likes': return (b.likes || 0) - (a.likes || 0);
      case 'recent': {
        const da = a.postedAt ? new Date(a.postedAt).getTime() : 0;
        const db = b.postedAt ? new Date(b.postedAt).getTime() : 0;
        return db - da;
      }
      default: return (b.virality || 0) - (a.virality || 0);
    }
  });
  return arr;
}

const fmtCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

export function MediaClient() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState(''); // raw input
  const [committedQ, setCommittedQ] = useState(''); // ключевое слово, по которому реально искали
  const [view, setView] = useState<'cards' | 'table'>('cards');

  const [items, setItems] = useState<MediaReel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countMode, setCountMode] = useState<'exact' | 'estimated'>('exact');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const isSearchMode = committedQ.trim().length > 0;

  // requestId защищает от гонки ответов при быстром переключении запросов.
  const reqRef = useRef(0);

  // ── BROWSE: локальная база, keyset-пагинация ──
  const fetchBrowse = useCallback(async (f: Filters, cur: string | null) => {
    const rid = ++reqRef.current;
    const more = Boolean(cur);
    if (more) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/research/media?${buildBrowseQuery(f, cur)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (rid !== reqRef.current) return;
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
  }, []);

  // ── SEARCH: живой глобальный поиск по Instagram (Apify) ──
  const runSearch = useCallback(async (q: string) => {
    const rid = ++reqRef.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setCursor(null); // у живого поиска нет keyset-пагинации
    try {
      const res = await fetch('/api/research/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: q,
          // авто-режим «самое популярное»: без жёстких порогов отдаётся полная
          // страница, самые просматриваемые сверху (фильтры применим клиент-сайд).
          minViews: 0,
          minLikes: 0,
          minComments: 0,
          minShares: 0,
          sortBy: 'viral_score',
          period: 'all',
          limit: 60,
          force: false, // тот же niche в пределах кэша не дёргает Apify заново
        }),
      });
      const json = await res.json();
      if (rid !== reqRef.current) return;
      if (!res.ok || !json.ok) {
        setError(errorText(json, res.status));
        setItems([]);
        setCount(0);
        return;
      }
      const reels: MediaReel[] = (json.reels ?? []).map((r: ResearchReelView) => ({
        ...r,
        isFav: false,
      }));
      setItems(reels);
      setCount(reels.length);
      setCountMode('exact');
    } catch (e) {
      if (rid !== reqRef.current) return;
      setError(e instanceof Error ? e.message : 'Не удалось выполнить поиск');
      setItems([]);
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, []);

  // Запуск живого поиска при смене ключевого слова (по кнопке «Поиск»/Enter).
  useEffect(() => {
    const q = committedQ.trim();
    if (q) runSearch(q);
  }, [committedQ, runSearch]);

  // Browse-режим: серверный re-query при смене фильтров. В search-режиме НЕ
  // дёргаем сервер на смену фильтра — фильтрация идёт клиент-сайд (см. visible()).
  useEffect(() => {
    if (!isSearchMode) fetchBrowse(filters, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchMode, filters, fetchBrowse]);

  // Коммит ключевого слова → запускает живой поиск (или возврат в browse, если пусто).
  const commitSearch = useCallback(() => {
    setCommittedQ(search.trim());
  }, [search]);

  // ── Клиент-сайд фильтрация выдачи живого поиска ──
  function filterSearchReels(list: MediaReel[]): MediaReel[] {
    let arr = list.filter((r) => !hidden.has(r.id));
    if (filters.type !== 'all') {
      const want = filters.type === 'post' ? 'image' : filters.type;
      arr = arr.filter((r) => (r.postType || 'reel') === want);
    }
    if (filters.period in PERIOD_DAYS) {
      const cutoff = Date.now() - PERIOD_DAYS[filters.period] * 86_400_000;
      arr = arr.filter((r) => r.postedAt && new Date(r.postedAt).getTime() >= cutoff);
    }
    if (filters.viral > 0) arr = arr.filter((r) => (r.virality ?? 0) >= filters.viral);
    if (filters.blogger.trim()) {
      const b = filters.blogger.trim().replace(/^@/, '').toLowerCase();
      arr = arr.filter((r) => r.author.username.toLowerCase().includes(b));
    }
    return sortReels(arr, filters.sort);
  }

  const visible = isSearchMode
    ? filterSearchReels(items)
    : items.filter((r) => !hidden.has(r.id));

  const displayCount = isSearchMode ? visible.length : count;

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setSearch('');
    setCommittedQ('');
    setFilters(DEFAULT_FILTERS);
  }

  function hide(id: string) {
    setHidden((s) => new Set(s).add(id));
  }

  return (
    <div className="grid gap-5">
      {/* ── Header ── */}
      <PageHero
        eyebrow="RESEARCH · MEDIA"
        title="Медиа"
        icon="media"
        description="Поиск контента по постам · фильтры виральности и ниши"
        extra={
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              commitSearch();
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-mute" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ниша или ключевое слово · напр. психология, смм, продажи b2b"
                  className="input !rounded-full !pl-11"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading && isSearchMode ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading && isSearchMode ? 'Ищу…' : 'Поиск'}
              </button>
              <button
                type="button"
                onClick={() => setView(view === 'cards' ? 'table' : 'cards')}
                className="btn-ghost"
                title="Переключить вид"
              >
                {view === 'cards' ? <Table2 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                {view === 'cards' ? 'Таблица' : 'Карточки'}
              </button>
            </div>
            <p className="text-[12px] text-text-mute">
              Каждый поиск — живой запрос ко всему Instagram (до ~60 сек на новую нишу).
              Пустое поле — лента по уже накопленной базе.
            </p>
          </form>
        }
      />

      {/* ── Filters ── */}
      <div className="panel grid gap-3 p-5 reveal">
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
            className="input !w-48 !rounded-full !py-1.5 !text-[13px]"
          />
          {!isSearchMode && (
            <Chip active={filters.fav} onClick={() => update('fav', !filters.fav)}>
              <Heart className={`h-3.5 w-3.5 ${filters.fav ? 'fill-current' : ''}`} />
              Избранное
            </Chip>
          )}
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] text-text-mute transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
            Сбросить
          </button>
        </FilterRow>
      </div>

      {/* ── Count ── */}
      <div className="text-[13px] tabular-nums text-text-mute">
        {displayCount != null && (
          <span>
            {isSearchMode ? `Instagram · «${committedQ}» · найдено: ` : 'Найдено: '}
            <span className="font-semibold text-text">
              {countMode === 'estimated' && !isSearchMode ? '~' : ''}
              {fmtCount(displayCount)}
            </span>
            {hidden.size > 0 && ` · скрыто ${hidden.size}`}
          </span>
        )}
      </div>

      {/* ── Results ── */}
      {error ? (
        <div className="panel !border-pink/40 flex flex-col items-center gap-2 p-8 text-center">
          <Icon3D name="warning" size={36} tile />
          <p className="mt-2 text-[15px] font-semibold text-pink">Ошибка</p>
          <p className="text-[13px] text-text-dim">{error}</p>
          <button
            type="button"
            onClick={() => (isSearchMode ? runSearch(committedQ.trim()) : fetchBrowse(filters, null))}
            className="btn-ghost mt-2 !px-4 !py-2 !text-[13px]"
          >
            <RefreshCw className="h-4 w-4" />
            Повторить
          </button>
        </div>
      ) : loading && isSearchMode ? (
        <div className="panel flex flex-col items-center gap-2 p-12 text-center fade-in">
          <Icon3D name="processing" size={44} tile sway />
          <p className="mt-3 text-[15px] font-semibold tracking-[-0.02em] text-text">
            Скрейп Instagram + индексация авторов…
          </p>
          <p className="text-[14px] text-text-dim">
            Живой поиск по нише «{committedQ}». Это может занять до 60 секунд при первом запросе.
          </p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[3/4] !rounded-[24px]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center fade-in">
          <Icon3D name="media" size={44} tile />
          <p className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-text">Ничего не найдено</p>
          <p className="max-w-prose text-[13px] text-text-dim">
            {isSearchMode
              ? 'По этому ключевому слову Instagram ничего не вернул или всё отсеяли фильтры. Попробуй другую формулировку или ослабь фильтры.'
              : 'Введи ключевое слово и нажми «Поиск» — это запустит живой поиск по Instagram.'}
          </p>
        </div>
      ) : view === 'table' ? (
        <ResearchTable reels={visible} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 stagger">
          {visible.map((r) => (
            <div key={r.id} className="relative group">
              <ResearchReelCard reel={r} initialFavorited={r.isFav} />
              <button
                type="button"
                onClick={() => hide(r.id)}
                title="Скрыть пост"
                aria-label="hide"
                className="absolute top-2.5 right-12 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-text opacity-0 backdrop-blur-md transition-opacity hover:border-pink/60 hover:text-pink group-hover:opacity-100"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Load more (keyset, только в browse-режиме) ── */}
      {!loading && !isSearchMode && cursor && visible.length > 0 && (
        <button
          type="button"
          onClick={() => fetchBrowse(filters, cursor)}
          disabled={loadingMore}
          className="btn-ghost justify-self-center"
        >
          {loadingMore && <RefreshCw className="h-4 w-4 animate-spin" />}
          {loadingMore ? 'Загрузка…' : 'Показать ещё'}
        </button>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="label w-16 shrink-0">
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
        active ? 'border-transparent bg-blue text-white' : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'
      }`}
    >
      {children}
    </button>
  );
}
