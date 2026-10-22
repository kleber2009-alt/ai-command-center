'use client';

import { useState, useTransition } from 'react';
import { ArrowRight, Pause, Play, Power, RefreshCw, Trash2 } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { errorText } from '@/lib/error-text';

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
        setError(errorText(json, res.status));
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
      <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-10 flex flex-col items-center gap-3 text-center fade-in">
        <Icon3D name="radars" size={44} tile sway />
        <div className="text-[18px] font-semibold tracking-[-0.02em] text-text">
          Пока ни одного радара.
        </div>
        <div className="text-[14px] text-text-dim max-w-prose">
          На странице{' '}
          <a href="/research" className="text-gold hover:text-lime">
            Research
          </a>{' '}
          после поиска нажми «+ В радар» — сохранится ниша + фильтры, и cron будет проверять её
          по расписанию.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 stagger">
      {error && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink">
          {error}
        </div>
      )}
      {radars.map((r) => (
        <article
          key={r.id}
          className={`panel p-5 grid sm:grid-cols-[auto_1fr_auto] gap-4 items-center ${
            r.enabled ? '' : 'opacity-60'
          }`}
        >
          <Icon3D name="radars" size={24} tile />
          <div className="grid gap-1.5 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-text">{r.niche}</h3>
              {r.enabled ? (
                <span className="status-badge status-ready">
                  активен
                </span>
              ) : (
                <span className="status-badge text-text-mute">
                  пауза
                </span>
              )}
            </div>
            <div className="flex gap-4 text-[12.5px] text-text-mute flex-wrap">
              <span>интервал: <span className="tabular-nums text-text">{r.intervalHrs}ч</span></span>
              <span>посл. запуск: <span className="text-text">{relDate(r.lastRunAt)}</span></span>
              <span>в выдаче: <span className="font-semibold tabular-nums text-gold">{r.lastResultCount}</span></span>
            </div>
          </div>
          <div className="flex gap-1.5 sm:justify-end flex-wrap items-center">
            <a
              href={`/research?niche=${encodeURIComponent(r.niche)}`}
              className="btn-ghost !px-4 !py-2 !text-[13px]"
            >
              Открыть
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => run(r.id)}
              disabled={running === r.id}
              className="btn-primary !px-4 !py-2 !text-[13px]"
            >
              {running === r.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
              {running === r.id ? '…' : 'Запустить'}
            </button>
            <button
              type="button"
              onClick={() => toggle(r.id, r.enabled)}
              className="btn-ghost !px-4 !py-2 !text-[13px]"
            >
              {r.enabled ? <Pause className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              {r.enabled ? 'Пауза' : 'Включить'}
            </button>
            <button
              type="button"
              onClick={() => remove(r.id)}
              aria-label="Удалить радар"
              className="btn-icon hover:!text-pink hover:!border-pink/40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
