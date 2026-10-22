'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, exceptionText } from '@/lib/error-text';

type Item = {
  key: string;
  label: string;
  href: string;
  sectionKey: string;
  sectionLabel: string;
  hidden: boolean;
};

type Grouped = { sectionKey: string; sectionLabel: string; items: Item[] };

export function AdminSidebarPanel({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const grouped: Grouped[] = useMemo(() => {
    const order: string[] = [];
    const byKey = new Map<string, Grouped>();
    for (const i of items) {
      let g = byKey.get(i.sectionKey);
      if (!g) {
        g = { sectionKey: i.sectionKey, sectionLabel: i.sectionLabel, items: [] };
        byKey.set(i.sectionKey, g);
        order.push(i.sectionKey);
      }
      g.items.push(i);
    }
    return order.map((k) => byKey.get(k)!);
  }, [items]);

  const hiddenCount = items.filter((i) => i.hidden).length;

  const toggle = async (item: Item, nextHidden: boolean) => {
    setBusyKey(item.key);
    setErr(null);
    // optimistic
    setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, hidden: nextHidden } : i)));
    try {
      const res = await fetch('/api/admin/sidebar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemKey: item.key, hidden: nextHidden }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        // revert
        setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, hidden: !nextHidden } : i)));
        setErr(errorText(j, res.status));
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, hidden: !nextHidden } : i)));
      setErr(exceptionText(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="panel flex flex-wrap items-center gap-4 p-4">
        <span className="text-[13px] tabular-nums text-text-mute">
          {items.length} items · {hiddenCount} hidden
          {isPending && <span className="ml-3 text-text-dim">/refreshing…</span>}
        </span>
        <span className="ml-auto text-[13px] text-text-dim">
          Toggle on = пункт показывается в левом меню
        </span>
      </div>

      {err && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink">
          /ERROR — {err}
        </div>
      )}

      <div className="grid gap-3 stagger">
        {grouped.map((g) => (
          <div key={g.sectionKey} className="panel overflow-hidden">
            <div className="px-5 py-2.5 border-b border-border-soft label !text-text-dim">
              /{g.sectionLabel}
            </div>
            {g.items.map((item) => {
              const visible = !item.hidden;
              return (
                <div
                  key={item.key}
                  className="grid grid-cols-[1fr_auto_80px] sm:grid-cols-[1fr_220px_120px] gap-3 px-5 py-3 items-center border-b border-border-soft last:border-b-0 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="grid">
                    <span className="text-[14.5px] font-medium text-text truncate">{item.label}</span>
                    <span className="font-mono text-[11px] text-text-mute truncate">
                      {item.key} · {item.href}
                    </span>
                  </div>
                  <div
                    className={`status-badge justify-self-end ${
                      visible ? 'status-ready' : 'status-failed'
                    }`}
                  >
                    {visible ? '/VISIBLE' : '/HIDDEN'}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visible}
                      disabled={busyKey === item.key}
                      onClick={() => toggle(item, visible)}
                      className={[
                        'relative inline-flex h-7 w-[46px] items-center rounded-full transition-colors duration-300 ease-settle',
                        visible ? 'bg-blue' : 'bg-white/20',
                        busyKey === item.key ? 'opacity-50' : '',
                      ].join(' ')}
                      title={visible ? 'Спрятать из меню' : 'Показывать в меню'}
                    >
                      <span
                        className={[
                          'inline-block h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] transform transition-transform duration-[450ms] ease-pop',
                          visible ? 'translate-x-[21px]' : 'translate-x-[3px]',
                        ].join(' ')}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
