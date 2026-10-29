'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpDown, AtSign, CreditCard, RefreshCw } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { errorText, exceptionText } from '@/lib/error-text';
import type { BlogItem, BlogSort, BlogState } from '@/lib/blog/items';
import { BlogCard, fmtCount } from './blog-card';

type Tab = 'reel' | 'carousel';

const SORTS: Record<Tab, Array<[BlogSort, string]>> = {
  reel: [
    ['score', 'Лучшие по медиане'],
    ['views', 'Просмотры'],
    ['shares', 'Репосты'],
    ['recent', 'Новые'],
  ],
  carousel: [
    ['score', 'Лучшие по медиане'],
    ['comments', 'Комментарии'],
    ['shares', 'Репосты'],
    ['recent', 'Новые'],
  ],
};

const PERIODS = [30, 90, 180, 365];

function sortLocal(items: BlogItem[], sort: BlogSort): BlogItem[] {
  const by = (f: (x: BlogItem) => number) => [...items].sort((a, b) => f(b) - f(a));
  if (sort === 'recent') return by((x) => (x.postedAt ? Date.parse(x.postedAt) : 0));
  if (sort === 'views') return by((x) => x.plays);
  if (sort === 'comments') return by((x) => x.comments);
  if (sort === 'shares') return by((x) => x.shares);
  if (sort === 'likes') return by((x) => x.likes);
  return by((x) => x.score);
}

export function BlogClient({ initial, apifyConfigured }: { initial: BlogState; apifyConfigured: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<BlogState>(initial);
  const [handle, setHandle] = useState(initial.handle ?? '');
  const [days, setDays] = useState(90);
  const [tab, setTab] = useState<Tab>(() =>
    initial.items.some((i) => i.kind === 'carousel') && !initial.items.some((i) => i.kind === 'reel') ? 'carousel' : 'reel',
  );
  const [sort, setSort] = useState<BlogSort>('score');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reels = useMemo(() => state.items.filter((i) => i.kind === 'reel'), [state.items]);
  const carousels = useMemo(() => state.items.filter((i) => i.kind === 'carousel'), [state.items]);
  const list = useMemo(() => sortLocal(tab === 'reel' ? reels : carousels, sort), [tab, reels, carousels, sort]);
  const med = state.medians[tab];
  const failedRun = state.lastRun?.status === 'failed' ? state.lastRun : null;
  const apifyBlocked = /Apify/.test(error ?? failedRun?.errorMsg ?? '') && /счет|счёт|оплат/i.test(error ?? failedRun?.errorMsg ?? '');

  async function reload() {
    const res = await fetch('/api/blog/items', { cache: 'no-store' });
    if (res.ok) setState((await res.json()) as BlogState);
  }

  async function refresh() {
    setRunning(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/blog/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim() || undefined, days, limit: days > 120 ? 120 : 60 }),
      });
      const raw = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* not JSON */
      }
      if (!res.ok) {
        setError(errorText(json as { error?: string; message?: string }, res.status));
        await reload();
        return;
      }
      if (!raw) {
        setError('Сервер не дождался Instagram — попробуйте ещё раз или уменьшите период.');
        return;
      }
      setNote(
        `Обновлено: ${json.reels ?? 0} рилсов и ${json.carousels ?? 0} каруселей у @${json.handle}.${json.note ? ` ${json.note}` : ''}`,
      );
      await reload();
    } catch (e) {
      setError(exceptionText(e));
    } finally {
      setRunning(false);
    }
  }

  async function remix(item: BlogItem) {
    if (item.pipelineId) {
      router.push(`/pipeline/${item.pipelineId}`);
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parserItemId: item.id, kind: item.kind }),
      });
      const json = (await res.json().catch(() => ({}))) as { pipeline?: { id: string }; error?: string; message?: string };
      if (!res.ok || !json.pipeline?.id) {
        setError(res.status === 404 && !json.error ? 'Конвейер ещё не подключён на сервере — попробуйте позже.' : errorText(json, res.status));
        return;
      }
      router.push(`/pipeline/${json.pipeline.id}`);
    } catch (e) {
      setError(exceptionText(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-6">
      {/* Source + refresh */}
      <section className="panel grid gap-4 p-5 sm:p-6 reveal">
        <h2 className="flex items-center gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Мой Instagram</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className="label">ник</span>
            <div className="relative">
              <AtSign size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input
                className="input !pl-9"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="ilia.paliy"
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
              />
            </div>
          </label>
          <label className="grid gap-1.5">
            <span className="label">период</span>
            <select className="input !py-2.5" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {PERIODS.map((d) => (
                <option key={d} value={d}>
                  {d} дней
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={refresh} disabled={running || !handle.trim()} className="btn-primary justify-center">
            <RefreshCw size={15} className={running ? 'animate-spin' : ''} />
            {running ? 'Забираю посты…' : 'Обновить из Instagram'}
          </button>
        </div>
        <p className="text-[12.5px] text-text-mute">
          {state.lastRun?.completedAt && state.lastRun.status === 'completed'
            ? `Последнее обновление: ${new Date(state.lastRun.completedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })} · просмотрено постов: ${state.lastRun.postsScanned}.`
            : 'Посты забираются через Apify, слайды и обложки копируются к нам — ссылки Instagram протухают через несколько дней.'}
        </p>
        {!apifyConfigured && (
          <p className="flex items-start gap-2 rounded-2xl border border-amber/35 bg-amber/[0.07] px-4 py-3 text-[13px] text-amber">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Не задан ключ Apify (APIFY_TOKEN) — без него посты из Instagram не забрать. Его добавляет администратор сервера.
          </p>
        )}
      </section>

      {running && (
        <div className="panel flex flex-col items-center gap-3 p-8 text-center fade-in">
          <Icon3D name="processing" size={44} tile sway />
          <div className="text-[16px] font-semibold tracking-[-0.02em] text-text">Забираю посты из Instagram и копирую слайды… до 2 минут.</div>
        </div>
      )}

      {(error || failedRun) && !running && (
        <div role="alert" className="panel flex flex-wrap items-start gap-3 !rounded-2xl !border-danger/40 p-4 text-[13.5px] text-danger fade-in">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1 leading-relaxed">{error ?? failedRun?.errorMsg}</span>
          {apifyBlocked && (
            <a href="https://console.apify.com/billing" target="_blank" rel="noopener noreferrer" className="btn-ghost !px-3.5 !py-1.5 text-[13px]">
              <CreditCard size={14} /> Оплатить Apify
            </a>
          )}
        </div>
      )}
      {note && !running && !error && (
        <div className="rounded-2xl border border-lime/30 bg-lime/[0.06] px-4 py-3 text-[13px] text-lime fade-in">{note}</div>
      )}

      {/* Tabs + list */}
      {!running && (
        <section className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Формат" className="flex gap-1 rounded-full border border-border-soft bg-white/[0.04] p-1">
              {(
                [
                  ['reel', 'Рилсы', reels.length],
                  ['carousel', 'Карусели', carousels.length],
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => {
                    setTab(key);
                    if (!SORTS[key].some(([s]) => s === sort)) setSort('score');
                  }}
                  className={`rounded-full px-4 py-1.5 text-[13.5px] transition-colors ${tab === key ? 'bg-blue font-semibold text-white' : 'text-text-dim hover:text-text'}`}
                >
                  {label} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[13px] text-text-dim">
              <ArrowUpDown size={14} />
              <select className="input !w-auto !py-1.5 text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as BlogSort)}>
                {SORTS[tab].map(([s, l]) => (
                  <option key={s} value={s}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {med.count > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[12px] text-text-dim [&>span]:rounded-full [&>span]:bg-white/[0.05] [&>span]:px-3 [&>span]:py-1 tabular-nums">
              <span>твоя медиана:</span>
              {tab === 'reel' ? (
                <>
                  <span>
                    просмотры <b className="text-text">{fmtCount(Math.round(med.views))}</b>
                  </span>
                  <span>
                    вовлечение <b className="text-text">{med.er.toFixed(1)}%</b>
                  </span>
                  <span>
                    репосты <b className="text-text">{fmtCount(Math.round(med.shares))}</b>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    комментарии <b className="text-text">{fmtCount(Math.round(med.comments))}</b>
                  </span>
                  <span>
                    репосты <b className="text-text">{fmtCount(Math.round(med.shares))}</b>
                  </span>
                  <span>
                    лайки <b className="text-text">{med.likes > 0 ? fmtCount(Math.round(med.likes)) : 'скрыты'}</b>
                  </span>
                </>
              )}
              <span>
                постов <b className="text-text">{med.count}</b>
              </span>
            </div>
          )}

          {list.length === 0 ? (
            <div className="panel flex flex-col items-center gap-3 p-10 text-center">
              <Icon3D name={tab === 'reel' ? 'video' : 'carousel'} size={48} tile />
              <div className="text-[17px] font-semibold tracking-[-0.02em] text-text">
                {state.items.length === 0 ? 'Пока пусто' : tab === 'reel' ? 'Рилсов не нашлось' : 'Каруселей не нашлось'}
              </div>
              <p className="max-w-[46ch] text-[14px] text-text-dim">
                {state.items.length === 0
                  ? 'Впиши ник и нажми «Обновить из Instagram» — заберу твои рилсы и карусели и покажу, какие из них лучшие.'
                  : 'Увеличь период и обнови ещё раз.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger">
              {list.map((it) => (
                <BlogCard key={it.id} item={it} busy={busyId === it.id} onRemix={remix} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
