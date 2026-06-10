'use client';

// Главный экран Research — поиск по нише + чипы-расширения + лента
// карточек. По референсу скрин 7: фиолетовый «новый поиск», под ним
// чипы синонимов от Claude, баннер свежести, фильтры/сортировки,
// верхний агрегатор по выборке.

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { ResearchReelCard } from './research-reel-card';
import { ResearchTable } from './research-table';
import { SearchHistoryDrawer } from './search-history-drawer';
import {
  addHistoryEntry,
  clearHistory,
  loadHistory,
  removeHistoryEntry,
  type SearchHistoryEntry,
} from './search-history';
import { apiErrorText } from './error-text';
import type {
  DurationBand,
  LanguageFilter,
  Period,
  PostTypeFilter,
  ResearchReelView,
  SearchError,
  SearchResponse,
  SortField,
} from './types';

type ViewMode = 'cards' | 'table';

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'viral_score', label: 'Виральный счёт' },
  { value: 'views', label: 'Больше просмотров' },
  { value: 'virality', label: 'Виральность ×' },
  { value: 'engagement', label: 'Вовлечённость' },
  { value: 'date', label: 'По дате' },
];

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'all', label: 'За всё время' },
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
];

const LANGUAGE_OPTIONS: Array<{ value: LanguageFilter; label: string }> = [
  { value: 'all', label: 'Любой язык' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'other', label: 'Другой / н/д' },
];

const POSTTYPE_OPTIONS: Array<{ value: PostTypeFilter; label: string }> = [
  { value: 'all', label: 'Все типы' },
  { value: 'reel', label: 'Reels' },
  { value: 'image', label: 'Фото' },
  { value: 'carousel', label: 'Карусель' },
];

const DURATION_OPTIONS: Array<{ value: DurationBand; label: string }> = [
  { value: 'all', label: 'Любая длина' },
  { value: 'short', label: 'до 30 сек' },
  { value: 'medium', label: '30–60 сек' },
  { value: 'long', label: '60+ сек' },
];

// По умолчанию — «самое популярное по просмотрам»: сортировка по views,
// порог 1 млн (пустые остальные метрики). Совпадает с авто-режимом сервера.
const DEFAULT_SORT: SortField = 'views';
const DEFAULT_PERIOD: Period = 'all';

// Пороги вхождения в выдачу — задаются пользователем ДО поиска (ТЗ §5).
// Пустые поля (0) = «без порога». Если пусты ВСЕ — авто-режим: сортировка
// по убыванию просмотров, полная страница (самые популярные сверху).
const DEFAULT_MIN_VIEWS = 0;
const DEFAULT_MIN_LIKES = 0;
const DEFAULT_MIN_COMMENTS = 0;
const DEFAULT_MIN_SHARES = 0;

type Thresholds = { views: number; likes: number; comments: number; shares: number };

// Пресеты — жёсткие пороги по просмотрам (опционально). Без пресета (пусто) —
// авто-режим «самое популярное» с полной страницей результатов.
const THRESHOLD_PRESETS: Array<{ key: string; label: string; values: Thresholds }> = [
  { key: 'soft', label: 'от 100K', values: { views: 100_000, likes: 0, comments: 0, shares: 0 } },
  { key: 'mid', label: 'от 500K', values: { views: 500_000, likes: 0, comments: 0, shares: 0 } },
  { key: 'hard', label: 'от 1M', values: { views: 1_000_000, likes: 0, comments: 0, shares: 0 } },
];

const formatCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

const DEMO_VISIBLE = 5; // ТЗ §5/§12 — первые N карточек, остальные blur

const EXAMPLE_NICHES = [
  'психология отношений',
  'нейросети для маркетинга',
  'фитнес дома',
  'личные финансы',
  'продажи b2b',
];

export function ResearchClient({ isFreePlan = false }: { isFreePlan?: boolean }) {
  const router = useRouter();
  const [niche, setNiche] = useState('');
  const [sortBy, setSortBy] = useState<SortField>(DEFAULT_SORT);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  // Клиент-сайд фильтры (применяются к уже полученной выборке, ТЗ §5)
  const [language, setLanguage] = useState<LanguageFilter>('all');
  const [postType, setPostType] = useState<PostTypeFilter>('all');
  const [duration, setDuration] = useState<DurationBand>('all');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('cards');
  const [pendingRadar, startRadar] = useTransition();
  const [radarMsg, setRadarMsg] = useState<string | null>(null);
  // Поиск конкретного блогера (ТЗ §5, скрины 1/3/4)
  const [blogger, setBlogger] = useState('');
  // Пороги вхождения — задаются ДО поиска, уходят в тело запроса.
  const [minViews, setMinViews] = useState(DEFAULT_MIN_VIEWS);
  const [minLikes, setMinLikes] = useState(DEFAULT_MIN_LIKES);
  const [minComments, setMinComments] = useState(DEFAULT_MIN_COMMENTS);
  const [minShares, setMinShares] = useState(DEFAULT_MIN_SHARES);
  // История поиска (localStorage) — чтобы выдача не пропадала при обновлении
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // На монтировании подтягиваем историю и восстанавливаем последнюю выдачу,
  // чтобы обновление страницы не стирало результаты.
  useEffect(() => {
    const entries = loadHistory();
    setHistory(entries);
    if (entries.length > 0) {
      const last = entries[0];
      setResult(last.response);
      setNiche(last.niche);
      setPeriod(last.period);
      setSortBy(last.sortBy);
      if (last.minViews != null) setMinViews(last.minViews);
      if (last.minLikes != null) setMinLikes(last.minLikes);
      if (last.minComments != null) setMinComments(last.minComments);
      if (last.minShares != null) setMinShares(last.minShares);
    }
  }, []);

  const thresholdsDirty =
    minViews !== DEFAULT_MIN_VIEWS ||
    minLikes !== DEFAULT_MIN_LIKES ||
    minComments !== DEFAULT_MIN_COMMENTS ||
    minShares !== DEFAULT_MIN_SHARES;

  // Какой пресет сейчас активен (если значения точно совпадают).
  const activePreset = THRESHOLD_PRESETS.find(
    (p) =>
      p.values.views === minViews &&
      p.values.likes === minLikes &&
      p.values.comments === minComments &&
      p.values.shares === minShares,
  )?.key;

  function applyPreset(values: Thresholds) {
    setMinViews(values.views);
    setMinLikes(values.likes);
    setMinComments(values.comments);
    setMinShares(values.shares);
  }

  function resetThresholds() {
    setMinViews(DEFAULT_MIN_VIEWS);
    setMinLikes(DEFAULT_MIN_LIKES);
    setMinComments(DEFAULT_MIN_COMMENTS);
    setMinShares(DEFAULT_MIN_SHARES);
  }

  function restoreFromHistory(entry: SearchHistoryEntry) {
    setError(null);
    setResult(entry.response);
    setNiche(entry.niche);
    setPeriod(entry.period);
    setSortBy(entry.sortBy);
    if (entry.minViews != null) setMinViews(entry.minViews);
    if (entry.minLikes != null) setMinLikes(entry.minLikes);
    if (entry.minComments != null) setMinComments(entry.minComments);
    if (entry.minShares != null) setMinShares(entry.minShares);
    setLanguage('all');
    setPostType('all');
    setDuration('all');
    setHistoryOpen(false);
  }

  function openBlogger(e: React.FormEvent) {
    e.preventDefault();
    const handle = blogger.trim().replace(/^@+/, '').replace(/\s+/g, '');
    if (handle.length < 3) {
      setError('Введи @username блогера (минимум 3 символа)');
      return;
    }
    router.push(`/research/author/${encodeURIComponent(handle.toLowerCase())}`);
  }

  function resetFilters() {
    const needReSearch = period !== DEFAULT_PERIOD;
    setSortBy(DEFAULT_SORT);
    setLanguage('all');
    setPostType('all');
    setDuration('all');
    setPeriod(DEFAULT_PERIOD);
    if (needReSearch && result) submit(undefined, { force: false, period: DEFAULT_PERIOD });
  }

  function submit(
    nicheValue?: string,
    opts: { force?: boolean; period?: Period; sortBy?: SortField } = {},
  ) {
    const q = (nicheValue ?? niche).trim();
    if (q.length < 2) {
      setError('Введи нишу (минимум 2 символа)');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/research/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            niche: q,
            sortBy: opts.sortBy ?? sortBy,
            period: opts.period ?? period,
            minViews,
            minLikes,
            minComments,
            minShares,
            limit: 40,
            force: opts.force ?? false,
          }),
        });
        const json: SearchResponse | SearchError = await res.json();
        if (!res.ok || !('ok' in json) || !json.ok) {
          const err = json as SearchError;
          setError(apiErrorText(err, res.status));
          setResult(null);
          return;
        }
        setResult(json);
        if (nicheValue !== undefined) setNiche(nicheValue);
        // Сохраняем выдачу в историю (localStorage), чтобы пережить рефреш.
        setHistory(
          addHistoryEntry({
            niche: q,
            period: opts.period ?? period,
            sortBy: opts.sortBy ?? sortBy,
            minViews,
            minLikes,
            minComments,
            minShares,
            at: Date.now(),
            response: json,
          }),
        );
      } catch (e) {
        setError((e as Error).message || 'network error');
      }
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  function addToRadar() {
    if (!result) return;
    setRadarMsg(null);
    startRadar(async () => {
      const res = await fetch('/api/research/radars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: result.niche,
          filters: { period, sortBy },
          intervalHrs: 24,
        }),
      });
      if (res.ok) {
        setRadarMsg('Добавлено в радар. Будет обновляться раз в сутки.');
        setTimeout(() => setRadarMsg(null), 4000);
      } else {
        const json = await res.json().catch(() => ({}));
        setRadarMsg('Не удалось: ' + (apiErrorText(json, res.status)));
      }
    });
  }

  function exportData(format: 'csv' | 'json') {
    if (!result) return;
    const ids = result.reels.map((r) => r.id).join(',');
    window.open(`/api/research/export?format=${format}&ids=${encodeURIComponent(ids)}`, '_blank');
  }

  // Re-sort клиент-сайд без нового запроса
  function applyLocalSort(reels: ResearchReelView[]): ResearchReelView[] {
    const arr = [...reels];
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'views': return (b.views || 0) - (a.views || 0);
        case 'virality': return (b.virality || 0) - (a.virality || 0);
        case 'engagement': return (b.engagementRate || 0) - (a.engagementRate || 0);
        case 'date': {
          const da = a.postedAt ? new Date(a.postedAt).getTime() : 0;
          const db = b.postedAt ? new Date(b.postedAt).getTime() : 0;
          return db - da;
        }
        default: return (b.viralScore || 0) - (a.viralScore || 0);
      }
    });
    return arr;
  }

  // Клиент-сайд фильтры по языку / типу / длительности (ТЗ §5).
  // Период обрабатывается на сервере (re-query), остальное — мгновенно.
  function applyClientFilters(reels: ResearchReelView[]): ResearchReelView[] {
    return reels.filter((r) => {
      if (language !== 'all') {
        const lang = r.language; // 'ru' | 'en' | null
        if (language === 'other') {
          if (lang === 'ru' || lang === 'en') return false;
        } else if (lang !== language) {
          return false;
        }
      }
      if (postType !== 'all' && (r.postType || 'reel') !== postType) return false;
      if (duration !== 'all') {
        const d = r.durationSec;
        if (d == null) return false; // длительность неизвестна — прячем при явном выборе
        if (duration === 'short' && d > 30) return false;
        if (duration === 'medium' && (d <= 30 || d > 60)) return false;
        if (duration === 'long' && d <= 60) return false;
      }
      return true;
    });
  }

  const filtersDirty =
    sortBy !== DEFAULT_SORT ||
    period !== DEFAULT_PERIOD ||
    language !== 'all' ||
    postType !== 'all' ||
    duration !== 'all';

  const displayed = result ? applyLocalSort(applyClientFilters(result.reels)) : [];
  const aggregates = computeAggregates(displayed);

  return (
    <div className="grid gap-6">
      {/* Search form */}
      <section className="border border-border bg-surface p-5">
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <label className="mono text-[10px] tracking-widest uppercase text-text-mute">
              Ниша или тема
            </label>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="btn-ghost flex items-center gap-1.5 text-[10px] tracking-widest uppercase whitespace-nowrap"
              title="История прошлых поисков"
            >
              <History className="w-3.5 h-3.5" />
              История
              {history.length > 0 && (
                <span className="text-gold">{history.length}</span>
              )}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="психология отношений, продажи b2b, нейросети для маркетинга…"
              className="flex-1 bg-bg border border-border focus:border-gold outline-none px-3 py-2.5 font-serif text-[15px] text-text placeholder:text-text-mute placeholder:italic"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={pending}
              className="btn-primary whitespace-nowrap text-[12px] tracking-widest uppercase"
            >
              {pending ? 'Ищу залётные…' : 'Найти вирусные'}
            </button>
          </div>

          {/* Пороги вхождения — задаются ДО поиска (ТЗ §5) */}
          <div className="grid gap-1.5 pt-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                Минимальные пороги
              </span>
              <div className="flex items-center gap-1.5">
                {THRESHOLD_PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    onClick={() => applyPreset(p.values)}
                    className={`px-2 py-1 mono text-[9px] tracking-widest uppercase border ${
                      activePreset === p.key
                        ? 'border-gold text-gold'
                        : 'border-border text-text-mute hover:text-text'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {thresholdsDirty && (
                  <button
                    type="button"
                    onClick={resetThresholds}
                    className="btn-ghost text-[9px] tracking-widest uppercase text-pink"
                  >
                    Сброс
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ThresholdField
                label="Просмотры"
                value={minViews}
                onChange={setMinViews}
                placeholder="пусто = все"
              />
              <ThresholdField
                label="Лайки"
                value={minLikes}
                onChange={setMinLikes}
                placeholder="без порога"
              />
              <ThresholdField
                label="Комментарии"
                value={minComments}
                onChange={setMinComments}
                placeholder="без порога"
              />
              <ThresholdField
                label="Репосты"
                value={minShares}
                onChange={setMinShares}
                placeholder="без порога"
              />
            </div>
            <span className="mono text-[9px] tracking-wider text-text-mute">
              Применяются к новому поиску. Пустые поля = авто-режим: самые просматриваемые
              рилсы, полная страница. Впиши значения (или выбери пресет) для жёсткого фильтра.
              Репосты Instagram отдаёт не всегда — рилсы без данных о репостах порог не отсекает.
            </span>
          </div>

          {/* Niche expansion chips */}
          {result && result.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              <span className="mono text-[9px] tracking-widest uppercase text-text-mute self-center">
                СМЕЖНЫЕ ТЕМЫ:
              </span>
              {result.keywords.map((kw) => (
                <button
                  type="button"
                  key={kw}
                  onClick={() => submit(kw)}
                  className="px-2 py-1 border border-border hover:border-lime hover:text-lime mono text-[10px] tracking-wider text-text-dim"
                >
                  {kw}
                </button>
              ))}
            </div>
          )}

          {/* Авто-режим «самое популярное» */}
          {result?.autoPopular && (
            <div className="mono text-[9px] tracking-widest uppercase text-gold pt-1">
              Авто-режим: самые просматриваемые рилсы (по убыванию). Задай пороги для
              жёсткого фильтра.
            </div>
          )}

          {/* Freshness banner + add to radar */}
          {result && (
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <div className="flex-1 min-w-[300px] border-l-2 border-cyan bg-cyan/5 px-3 py-2 font-serif italic text-[12.5px] text-text-dim leading-snug">
                {result.cacheHit
                  ? 'Результаты из недавнего поиска. Жми «Обновить» чтобы пересобрать с нуля.'
                  : 'Ролики собраны напрямую из поиска Instagram — актуальны и продвигаются прямо сейчас.'}
              </div>
              <button
                type="button"
                onClick={addToRadar}
                disabled={pendingRadar}
                className="btn-ghost text-[10px] tracking-widest uppercase whitespace-nowrap"
                title="Сохранить нишу как радар — cron будет обновлять её раз в сутки"
              >
                {pendingRadar ? '…' : '+ В радар'}
              </button>
            </div>
          )}
          {radarMsg && (
            <div className="mono text-[10px] tracking-wider text-lime">{radarMsg}</div>
          )}

          {error && (
            <div className="border border-pink/40 bg-pink/5 px-3 py-2 mono text-[11px] text-pink">
              {error}
            </div>
          )}
        </form>

        {/* Поиск конкретного блогера (ТЗ §5, скрины 1/3/4) */}
        <form
          onSubmit={openBlogger}
          className="mt-4 pt-4 border-t border-border-soft flex flex-col sm:flex-row gap-2 sm:items-end"
        >
          <div className="grid gap-1 flex-1">
            <label className="mono text-[10px] tracking-widest uppercase text-text-mute">
              …или открой конкретного блогера
            </label>
            <div className="flex items-center bg-bg border border-border focus-within:border-cyan px-3">
              <span className="font-serif text-[15px] text-text-mute select-none">@</span>
              <input
                type="text"
                value={blogger}
                onChange={(e) => setBlogger(e.target.value)}
                placeholder="username (минимум 3 символа)"
                className="flex-1 bg-transparent outline-none py-2.5 pl-1 font-serif text-[15px] text-text placeholder:text-text-mute placeholder:italic"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <button
            type="submit"
            className="btn-ghost whitespace-nowrap text-[12px] tracking-widest uppercase"
          >
            Анализ профиля →
          </button>
        </form>
      </section>

      {/* Niche aggregate summary (Module 4) */}
      {result?.nicheSummary && (
        <section className="border border-gold/40 bg-gold/5 p-5 grid gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="mono text-[10px] tracking-widest uppercase text-gold">
              Паттерны ниши «{result.niche}»
            </h2>
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
              Claude · по топ-{result.reels.length} рилсам
            </span>
          </div>
          <p className="font-serif text-[15px] leading-relaxed text-text">
            {result.nicheSummary.summary}
          </p>
          <div className="grid sm:grid-cols-3 gap-3 pt-1">
            {result.nicheSummary.dominant_hooks.length > 0 && (
              <SummaryChipBox title="Доминирующие хуки" items={result.nicheSummary.dominant_hooks} tone="lime" />
            )}
            {result.nicheSummary.dominant_formats.length > 0 && (
              <SummaryChipBox title="Форматы" items={result.nicheSummary.dominant_formats} tone="cyan" />
            )}
            {result.nicheSummary.dominant_topics.length > 0 && (
              <SummaryChipBox title="Темы" items={result.nicheSummary.dominant_topics} tone="text" />
            )}
          </div>
          {result.nicheSummary.duration_band && (
            <div className="mono text-[10px] tracking-widest uppercase text-text-mute">
              Длительность: <span className="text-text">{result.nicheSummary.duration_band}</span>
            </div>
          )}
        </section>
      )}

      {/* Filters + aggregate */}
      {result && (
        <section className="border border-border bg-surface p-4 grid gap-4">
          {/* Ряд фильтров (ТЗ §5) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
            <SelectField
              label="Сортировка"
              value={sortBy}
              onChange={(v) => setSortBy(v as SortField)}
              options={SORT_OPTIONS}
            />
            <SelectField
              label="Период"
              value={period}
              onChange={(v) => {
                const p = v as Period;
                setPeriod(p);
                submit(undefined, { force: false, period: p });
              }}
              options={PERIOD_OPTIONS}
            />
            <SelectField
              label="Язык"
              value={language}
              onChange={(v) => setLanguage(v as LanguageFilter)}
              options={LANGUAGE_OPTIONS}
            />
            <SelectField
              label="Тип поста"
              value={postType}
              onChange={(v) => setPostType(v as PostTypeFilter)}
              options={POSTTYPE_OPTIONS}
            />
            <SelectField
              label="Длительность"
              value={duration}
              onChange={(v) => setDuration(v as DurationBand)}
              options={DURATION_OPTIONS}
            />
          </div>

          {/* Ряд агрегатов по выборке + действия (ТЗ §5 тулбар) */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border-soft pt-3">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <div className="grid gap-0.5">
                <span className="mono text-[8px] tracking-widest uppercase text-text-mute">Найдено</span>
                <span className="font-serif text-[18px] text-gold leading-none">{displayed.length}</span>
              </div>
              <div className="grid gap-0.5">
                <span className="mono text-[8px] tracking-widest uppercase text-text-mute">Сред. вир.</span>
                <span className="font-serif text-[18px] text-lime leading-none">
                  {aggregates.avgVirality ? `${aggregates.avgVirality.toFixed(1)}×` : '—'}
                </span>
              </div>
              <Aggregate label="Медиана" value={aggregates.medianViews} />
              <Aggregate label="ΣПРОСМ" value={aggregates.sumViews} />
              <Aggregate label="ΣЛАЙКИ" value={aggregates.sumLikes} />
              <Aggregate label="ΣКОММ" value={aggregates.sumComments} />
              <Aggregate label="ΣРЕПОСТ" value={aggregates.sumShares} />
            </div>

          <div className="flex flex-wrap items-center gap-3 text-right">
            {filtersDirty && (
              <button
                type="button"
                onClick={resetFilters}
                className="btn-ghost text-[10px] tracking-widest uppercase whitespace-nowrap text-pink"
              >
                Сбросить всё
              </button>
            )}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setView('cards')}
                className={`px-2 py-1 mono text-[10px] tracking-widest uppercase border ${
                  view === 'cards' ? 'border-gold text-gold' : 'border-border text-text-mute hover:text-text'
                }`}
              >
                Карточки
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                className={`px-2 py-1 mono text-[10px] tracking-widest uppercase border ${
                  view === 'table' ? 'border-gold text-gold' : 'border-border text-text-mute hover:text-text'
                }`}
              >
                Таблица
              </button>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => exportData('csv')}
                className="btn-ghost text-[10px] tracking-widest uppercase"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => exportData('json')}
                className="btn-ghost text-[10px] tracking-widest uppercase"
              >
                JSON
              </button>
            </div>
            <button
              type="button"
              onClick={() => submit(undefined, { force: true })}
              disabled={pending}
              className="btn-ghost text-[10px] tracking-widest uppercase whitespace-nowrap"
            >
              Обновить
            </button>
          </div>
          </div>
        </section>
      )}

      {/* Onboarding — первый визит, пока не было ни одного поиска */}
      {!pending && !result && (
        <section className="border border-border bg-surface p-8 lg:p-12 grid gap-6">
          <div>
            <div className="mono text-[10px] tracking-widest uppercase text-gold mb-2">/ как это работает</div>
            <div className="font-serif text-[22px] text-text leading-snug max-w-[48ch]">
              Введи нишу — получишь ленту рилсов, которые реально залетели,
              с метриками виральности по каждому.
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="border border-border-soft p-4">
              <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-2">01 · Поиск</div>
              <div className="font-serif italic text-[14px] text-text-dim leading-snug">
                Скрейпим свежие рилсы ниши и считаем виральность, ER и скорость набора просмотров. Поиск бесплатный.
              </div>
            </div>
            <div className="border border-border-soft p-4">
              <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-2">02 · Разбор</div>
              <div className="font-serif italic text-[14px] text-text-dim leading-snug">
                Лучшие ролики транскрибируй и разбирай AI-анализом: хук, структура, почему залетело.
              </div>
            </div>
            <div className="border border-border-soft p-4">
              <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-2">03 · Свой контент</div>
              <div className="font-serif italic text-[14px] text-text-dim leading-snug">
                Генерируй хуки и сценарии по формулам залетевших — и ставь нишу на радар, чтобы не пропускать новое.
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <span className="mono text-[10px] tracking-widest uppercase text-text-mute">Попробуй с примера</span>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_NICHES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => submit(n)}
                  className="px-3 py-1.5 mono text-[10px] tracking-widest uppercase border border-border text-text-dim hover:border-gold hover:text-gold transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Grid */}
      {pending && !result && <SearchProgress />}

      {result && displayed.length === 0 && (
        <section className="border border-border bg-surface p-12 text-center">
          <div className="font-serif text-[18px] text-text-dim">
            Ничего не залетело по этим критериям.
          </div>
          <div className="mono text-[10px] tracking-widest uppercase text-text-mute mt-2">
            Попробуй смежную тему из чипов выше или расширь период
          </div>
        </section>
      )}

      {displayed.length > 0 && view === 'cards' && (
        <section className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0.5 bg-border-soft">
            {displayed.map((reel, i) => (
              <ResearchReelCard
                key={reel.id}
                reel={reel}
                blurred={isFreePlan && i >= DEMO_VISIBLE}
              />
            ))}
          </div>
          {isFreePlan && displayed.length > DEMO_VISIBLE && <DemoGate visibleCount={DEMO_VISIBLE} totalCount={displayed.length} />}
        </section>
      )}

      {displayed.length > 0 && view === 'table' && (
        <>
          <ResearchTable reels={isFreePlan ? displayed.slice(0, DEMO_VISIBLE) : displayed} />
          {isFreePlan && displayed.length > DEMO_VISIBLE && (
            <DemoGate visibleCount={DEMO_VISIBLE} totalCount={displayed.length} compact />
          )}
        </>
      )}

      {/* Stats footer */}
      {result?.stats && (
        <section className="mono text-[9px] tracking-widest uppercase text-text-mute flex flex-wrap gap-4">
          <span>скрейп: {result.stats.scraped}</span>
          <span>кандидатов: {result.stats.candidates}</span>
          <span>авторов: {result.stats.authors}</span>
          {result.stats.byKind && (
            <span title="распределение типов из скрейпа">
              типы: R{result.stats.byKind.reels}/C{result.stats.byKind.carousels}/I
              {result.stats.byKind.images}/U{result.stats.byKind.unknown} · пропущено{' '}
              {result.stats.byKind.skipped}
            </span>
          )}
          <span>время: {(result.stats.durationMs / 1000).toFixed(1)}с</span>
          {result.cacheHit && <span className="text-lime">из кэша</span>}
        </section>
      )}
      {/* Диагностика причины пустой выдачи */}
      {result && result.errors && result.errors.length > 0 && displayed.length === 0 && (
        <section className="border border-pink/30 bg-pink/5 p-3 grid gap-1">
          <span className="mono text-[9px] tracking-widest uppercase text-pink">Диагностика</span>
          {result.errors.map((e, i) => (
            <span key={i} className="mono text-[10px] text-text-dim break-all">
              {e}
            </span>
          ))}
        </section>
      )}

      <SearchHistoryDrawer
        open={historyOpen}
        entries={history}
        onClose={() => setHistoryOpen(false)}
        onRestore={restoreFromHistory}
        onRemove={(id) => setHistory(removeHistoryEntry(id))}
        onClear={() => setHistory(clearHistory())}
      />
    </div>
  );
}

// Поле порога: целое число ≥ 0. Пустое значение трактуем как 0 (без порога).
// Поиск — один синхронный запрос без серверного прогресса, поэтому этапы
// показываем по таймеру: они соответствуют реальному порядку работы
// search/route.ts (скрейп → метрики → индексация авторов).
function SearchProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const stages = [
    { from: 0, label: 'Скрейпим свежие рилсы из Instagram…' },
    { from: 15, label: 'Считаем виральность, ER и скорость набора…' },
    { from: 35, label: 'Индексируем авторов ниши…' },
  ];
  const current = [...stages].reverse().find((s) => elapsed >= s.from) ?? stages[0];
  const pct = Math.min(95, Math.round(elapsed * 2.2));
  return (
    <section className="border border-border bg-surface p-12 text-center grid gap-4">
      <div className="mono text-[10px] tracking-widest uppercase text-text-mute">
        {current.label}
      </div>
      <div className="max-w-[360px] w-full mx-auto">
        <div className="h-[2px] bg-border overflow-hidden">
          <div className="h-full bg-gold transition-all duration-1000" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 mono text-[9px] tracking-widest uppercase text-text-mute">
          <span>{elapsed} c</span>
          <span>до ~60 c при первом поиске ниши</span>
        </div>
      </div>
      <div className="font-serif italic text-[14px] text-text-dim">
        Повторные поиски той же ниши отдаются из кэша почти мгновенно.
      </div>
    </section>
  );
}

function ThresholdField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value === 0 ? '' : String(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          onChange(digits === '' ? 0 : Math.min(Number(digits), 1_000_000_000));
        }}
        placeholder={placeholder}
        className="bg-bg border border-border focus:border-gold outline-none px-2 py-1.5 mono text-[12px] tracking-wider text-text placeholder:text-text-mute"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-1">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg border border-border focus:border-gold outline-none px-2 py-1.5 mono text-[11px] tracking-wider text-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Aggregate({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-0.5 text-right">
      <span className="mono text-[8px] tracking-widest uppercase text-text-mute">{label}</span>
      <span className="font-serif text-[16px] text-text leading-none">{formatCount(value)}</span>
    </div>
  );
}

function DemoGate({
  visibleCount,
  totalCount,
  compact = false,
}: {
  visibleCount: number;
  totalCount: number;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="border border-gold/40 bg-gold/5 p-4 text-center grid gap-2">
        <div className="font-serif italic text-[15px] text-text">
          Скрыто {totalCount - visibleCount} карточек. Демо-режим показывает только первые {visibleCount}.
        </div>
        <div>
          <a href="/billing" className="btn-primary text-[10px] tracking-widest uppercase inline-block">
            Снять ограничения →
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-6">
      <div className="pointer-events-auto border border-gold/40 bg-bg/95 backdrop-blur p-5 grid gap-2 max-w-md text-center">
        <span className="mono text-[9px] tracking-widest uppercase text-gold">DEMO MODE</span>
        <div className="font-serif text-[16px] text-text">
          Тебе видны первые {visibleCount} из {totalCount} рилсов.
        </div>
        <p className="font-serif italic text-[13px] text-text-mute leading-snug">
          Остальные размыты. На платном тарифе — вся выдача без ограничений + анализ, транскрибация, генератор хуков.
        </p>
        <a href="/billing" className="btn-primary text-[10px] tracking-widest uppercase">
          Снять ограничения →
        </a>
      </div>
    </div>
  );
}

function SummaryChipBox({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'lime' | 'cyan' | 'text';
}) {
  const chipCls =
    tone === 'lime'
      ? 'border-lime/40 text-lime'
      : tone === 'cyan'
        ? 'border-cyan/40 text-cyan'
        : 'border-border text-text';
  return (
    <div className="grid gap-1.5">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className={`px-2 py-1 border mono text-[10px] tracking-wider ${chipCls}`}>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function computeAggregates(reels: ResearchReelView[]) {
  const sumViews = reels.reduce((a, r) => a + (r.views || 0), 0);
  const sumLikes = reels.reduce((a, r) => a + (r.likes || 0), 0);
  const sumComments = reels.reduce((a, r) => a + (r.comments || 0), 0);
  const sumShares = reels.reduce((a, r) => a + (r.shares || 0), 0);
  const viralities = reels.map((r) => r.virality).filter((v): v is number => v != null);
  const avgVirality = viralities.length > 0
    ? viralities.reduce((a, b) => a + b, 0) / viralities.length
    : null;
  // Медиана просмотров по выборке (ТЗ §5 тулбар).
  const sortedViews = reels.map((r) => r.views || 0).sort((a, b) => a - b);
  const n = sortedViews.length;
  const medianViews = n === 0
    ? 0
    : n % 2
      ? sortedViews[(n - 1) / 2]
      : Math.round((sortedViews[n / 2 - 1] + sortedViews[n / 2]) / 2);
  return { sumViews, sumLikes, sumComments, sumShares, avgVirality, medianViews };
}
