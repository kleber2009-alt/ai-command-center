'use client';

// «История поиска» — список прошлых прогонов парсера. Самая свежая выдача
// показывается выше (ParserResults), сюда попадает всё, что было до неё.
// Запись раскрывается по клику: items прошлого прогона подгружаются лениво
// через GET /api/parser/runs/[id] и показываются теми же карточками.

import { useState } from 'react';
import { ParserReelCard } from './parser-reel-card';
import type { ParserItemSerialized, ParserRunSerialized } from './types';

type Props = {
  runs: ParserRunSerialized[];
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function HistoryRow({ run }: { run: ParserRunSerialized }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ParserItemSerialized[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/parser/runs/${run.id}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.message || json.error || `HTTP ${res.status}`);
          return;
        }
        setItems((json.items as ParserItemSerialized[]) || []);
      } catch (e) {
        setError((e as Error).message || 'network error');
      } finally {
        setLoading(false);
      }
    }
  }

  const found = run.reelsFound + run.carouselsFound;
  const visible = items?.filter((i) => i.status !== 'dismissed') ?? [];

  return (
    <div className="border border-border bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left p-3 sm:p-4 grid grid-cols-[auto_1fr_auto] gap-3 items-center hover:bg-bg/40 transition-colors"
      >
        <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
          {open ? '−' : '+'}
        </span>
        <div className="min-w-0 grid gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="mono text-[11px] tracking-wider text-text">{fmtDate(run.startedAt)}</span>
            <span className="mono text-[10px] text-text-dim">
              <span className="text-text">{found}</span> постов
            </span>
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
              R{run.reelsFound} · C{run.carouselsFound}
            </span>
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
              скан {run.postsScanned}
            </span>
          </div>
          {run.claudeSummary && (
            <p className="font-serif italic text-[12.5px] leading-snug text-text-dim line-clamp-1">
              {run.claudeSummary}
            </p>
          )}
        </div>
        <span className="mono text-[9px] tracking-widest uppercase text-text-mute whitespace-nowrap">
          {open ? 'свернуть' : 'открыть'}
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-3 sm:p-4 grid gap-2">
          {loading && (
            <div className="mono text-[11px] text-text-mute">Загружаю выдачу…</div>
          )}
          {error && (
            <div className="border border-pink/40 bg-pink/5 px-2 py-1 mono text-[11px] text-pink">
              {error}
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div className="mono text-[11px] text-text-mute">Пусто — все посты этого прогона скрыты.</div>
          )}
          {visible.map((it) => (
            <ParserReelCard
              key={it.id}
              item={it}
              onUpdated={(u) =>
                setItems((cur) => (cur ? cur.map((i) => (i.id === u.id ? u : i)) : cur))
              }
              onRemoved={(id) =>
                setItems((cur) => (cur ? cur.filter((i) => i.id !== id) : cur))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ParserHistory({ runs }: Props) {
  if (runs.length === 0) return null;

  return (
    <section className="grid gap-4">
      <div className="flex items-baseline gap-3">
        <span className="sec-num">/04</span>
        <span className="sec-title">История поиска · {runs.length}</span>
        <span className="flex-1 border-b border-border translate-y-[-3px]" />
      </div>
      <div className="grid gap-2">
        {runs.map((r) => (
          <HistoryRow key={r.id} run={r} />
        ))}
      </div>
    </section>
  );
}
