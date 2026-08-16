'use client';

import { useState, useTransition } from 'react';
import { apiErrorText } from './error-text';

type Radar = {
  id: string;
  niche: string;
  intervalHrs: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastResultCount: number;
  createdAt: string;
};

function relDate(iso: string | null): string {
  if (!iso) return 'не запускался';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} д назад`;
  return `${Math.floor(d / 30)} мес назад`;
}

export function RadarsClient({ initialRadars }: { initialRadars: Radar[] }) {
  const [radars, setRadars] = useState<Radar[]>(initialRadars);
  const [running, setRunning] = useState<string | null>(null);
  const [_, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(id: string) {
    setRunning(id);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/research/radars/${id}/run`, { method: 'POST' });
      const json = await res.json();
      setRunning(null);
      if (!res.ok) {
        setError(apiErrorText(json, res.status));
        return;
      }
      // Обновляем lastRunAt в state
      setRadars((rr) =>
        rr.map((r) =>
          r.id === id
            ? { ...r, lastRunAt: new Date().toISOString(), lastResultCount: json.reelIds?.length || 0 }
            : r,
        ),
      );
    });
  }

  function toggle(id: string, enabled: boolean) {
    startTransition(async () => {
      const res = await fetch(`/api/research/radars/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) {
        setRadars((rr) => rr.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
      }
    });
  }

  function remove(id: string) {
    if (!confirm('Удалить радар?')) return;
    startTransition(async () => {
      const res = await fetch(`/api/research/radars/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRadars((rr) => rr.filter((r) => r.id !== id));
      }
    });
  }

  if (radars.length === 0) {
    return (
      <div className="border border-border-soft bg-surface/50 p-8 text-center">
        <div className="font-serif italic text-[17px] text-text-dim">
          Пока ни одного радара.
        </div>
        <div className="font-serif text-[14px] text-text-mute mt-2 max-w-prose mx-auto">
          На странице{' '}
          <a href="/research" className="text-lime hover:text-gold">
            Research
          </a>{' '}
          после поиска нажми «+ В радар» — сохранится ниша + фильтры, и cron будет проверять её
          по расписанию.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {error && (
        <div className="border border-pink/40 bg-pink/5 px-3 py-2 mono text-[11px] text-pink">
          {error}
        </div>
      )}
      {radars.map((r) => (
        <article
          key={r.id}
          className={`border bg-surface p-4 grid sm:grid-cols-[1fr_auto] gap-3 items-center ${
            r.enabled ? 'border-border' : 'border-border-soft opacity-60'
          }`}
        >
          <div className="grid gap-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h3 className="font-serif text-[17px] text-text">{r.niche}</h3>
              {r.enabled ? (
                <span className="mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 bg-lime/10 border border-lime/40 text-lime">
                  активен
                </span>
              ) : (
                <span className="mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 border border-border text-text-mute">
                  пауза
                </span>
              )}
            </div>
            <div className="flex gap-4 mono text-[10px] tracking-wider text-text-mute flex-wrap">
              <span>интервал: <span className="text-text">{r.intervalHrs}ч</span></span>
              <span>посл. запуск: <span className="text-text">{relDate(r.lastRunAt)}</span></span>
              <span>в выдаче: <span className="text-gold">{r.lastResultCount}</span></span>
            </div>
          </div>
          <div className="flex gap-1 sm:justify-end flex-wrap">
            <a
              href={`/research?niche=${encodeURIComponent(r.niche)}`}
              className="btn-ghost text-[10px] tracking-widest uppercase"
            >
              Открыть
            </a>
            <button
              type="button"
              onClick={() => run(r.id)}
              disabled={running === r.id}
              className="btn-primary text-[10px] tracking-widest uppercase"
            >
              {running === r.id ? '…' : 'Запустить'}
            </button>
            <button
              type="button"
              onClick={() => toggle(r.id, r.enabled)}
              className="btn-ghost text-[10px] tracking-widest uppercase"
            >
              {r.enabled ? 'Пауза' : 'Включить'}
            </button>
            <button
              type="button"
              onClick={() => remove(r.id)}
              className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-pink px-2"
            >
              ✕
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
