'use client';

// Главный экран Research — поиск по нише + чипы-расширения + лента
// карточек. По референсу скрин 7: фиолетовый «новый поиск», под ним
// чипы синонимов от Claude, баннер свежести, фильтры/сортировки,
// верхний агрегатор по выборке.

import { useState, useTransition } from 'react';
import { ResearchReelCard } from './research-reel-card';
import { ResearchTable } from './research-table';
import type {
  Period,
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

const formatCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

const DEMO_VISIBLE = 5; // ТЗ §5/§12 — первые N карточек, остальные blur

export function ResearchClient({ isFreePlan = false }: { isFreePlan?: boolean }) {
  const [niche, setNiche] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('viral_score');
  const [period, setPeriod] = useState<Period>('all');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('cards');
  const [pendingRadar, startRadar] = useTransition();
  const [radarMsg, setRadarMsg] = useState<string | null>(null);

  function submit(nicheValue?: string, opts: { force?: boolean } = {}) {
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
            sortBy,
            period,
            limit: 40,
            force: opts.force ?? false,
          }),
        });
        const json: SearchResponse | SearchError = await res.json();
        if (!res.ok || !('ok' in json) || !json.ok) {
          const err = json as SearchError;
          setError(err.message || err.error || `HTTP ${res.status}`);
          setResult(null);
          return;
        }
        setResult(json);
        if (nicheValue !== undefined) setNiche(nicheValue);
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
        setRadarMsg('Не удалось: ' + (json.message || json.error || `HTTP ${res.status}`));
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

  const displayed = result ? applyLocalSort(result.reels) : [];
  const aggregates = computeAggregates(displayed);

  return (
    <div className="grid gap-6">
      {/* Search form */}
      <section className="border border-border bg-surface p-5">
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="mono text-[10px] tracking-widest uppercase text-text-mute">
            Ниша или тема
          </label>
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
        <section className="border border-border bg-surface p-4 grid gap-4 lg:grid-cols-[1fr_auto] items-end">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                setPeriod(v as Period);
                submit(undefined, { force: false });
              }}
              options={PERIOD_OPTIONS}
            />
            <div className="grid gap-1">
              <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Найдено</span>
              <span className="font-serif text-[22px] text-gold leading-none">{displayed.length}</span>
            </div>
            <div className="grid gap-1">
              <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Сред. виральность</span>
              <span className="font-serif text-[22px] text-lime leading-none">
                {aggregates.avgVirality ? `${aggregates.avgVirality.toFixed(1)}×` : '—'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-right">
            <Aggregate label="ΣПРОСМ" value={aggregates.sumViews} />
            <Aggregate label="ΣЛАЙКИ" value={aggregates.sumLikes} />
            <Aggregate label="ΣКОММ" value={aggregates.sumComments} />
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
        </section>
      )}

      {/* Grid */}
      {pending && !result && (
        <section className="border border-border bg-surface p-12 text-center">
          <div className="mono text-[10px] tracking-widest uppercase text-text-mute">
            Скрейп Instagram + индексация авторов…
          </div>
          <div className="font-serif italic text-[16px] text-text-dim mt-2">
            Это может занять до 60 секунд при первом поиске ниши.
          </div>
        </section>
      )}

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
          <span>время: {(result.stats.durationMs / 1000).toFixed(1)}с</span>
          {result.cacheHit && <span className="text-lime">из кэша</span>}
        </section>
      )}
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
  return { sumViews, sumLikes, sumComments, sumShares, avgVirality };
}
