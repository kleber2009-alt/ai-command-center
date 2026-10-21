'use client';

// «История поиска» — список прошлых прогонов парсера. Самая свежая выдача
// показывается выше (ParserResults), сюда попадает всё, что было до неё.
// Запись раскрывается по клику: items прошлого прогона подгружаются лениво
// через GET /api/parser/runs/[id] и показываются теми же карточками.

import { useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
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
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left p-4 sm:p-5 grid grid-cols-[auto_1fr_auto] gap-3 items-center hover:bg-white/[0.03] transition-colors"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-text-mute">
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ease-settle ${open ? 'rotate-180' : ''}`} />
        </span>
        <div className="min-w-0 grid gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[14px] font-semibold text-text">{fmtDate(run.startedAt)}</span>
            <span className="text-[12.5px] text-text-dim">
              <span className="font-semibold tabular-nums text-text">{found}</span> постов
            </span>
            <span className="text-[12px] tabular-nums text-text-mute">
              R{run.reelsFound} · C{run.carouselsFound}
            </span>
            <span className="text-[12px] tabular-nums text-text-mute">
              скан {run.postsScanned}
            </span>
          </div>
          {run.claudeSummary && (
            <p className="text-[13px] leading-snug text-text-dim line-clamp-1">
              {run.claudeSummary}
            </p>
          )}
        </div>
        <span className="text-[12.5px] text-text-mute whitespace-nowrap">
          {open ? 'свернуть' : 'открыть'}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-soft p-3 sm:p-4 grid gap-2.5 fade-in">
          {loading && (
            <div className="inline-flex items-center gap-2 text-[13px] text-text-mute"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Загружаю выдачу…</div>
          )}
          {error && (
            <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-3.5 py-2 text-[13px] text-pink">
              {error}
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div className="text-[13px] text-text-mute">Пусто — все посты этого прогона скрыты.</div>
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
      <div className="flex items-center gap-3">
        <span className="sec-num">/04</span>
        <span className="sec-title">История поиска · {runs.length}</span>
        <span className="flex-1 h-px bg-border-soft" />
      </div>
      <div className="grid gap-2.5 stagger">
        {runs.map((r) => (
          <HistoryRow key={r.id} run={r} />
        ))}
      </div>
    </section>
  );
}
