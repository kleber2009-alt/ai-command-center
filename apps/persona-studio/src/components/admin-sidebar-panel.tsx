'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

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
        setErr(j.error ?? `http_${res.status}`);
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, hidden: !nextHidden } : i)));
      setErr(String(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4 border border-border bg-surface p-4">
        <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
          {items.length} items · {hiddenCount} hidden
          {isPending && <span className="ml-3 text-text-dim">/refreshing…</span>}
        </span>
        <span className="ml-auto font-serif italic text-[13px] text-text-dim">
          Toggle on = пункт показывается в левом меню
        </span>
      </div>

      {err && (
        <div className="border border-border bg-surface px-4 py-3 mono text-[11px] tracking-wider text-pink">
          /ERROR — {err}
        </div>
      )}

      <div className="grid gap-3">
        {grouped.map((g) => (
          <div key={g.sectionKey} className="border border-border">
            <div className="px-5 py-2 bg-surface border-b border-border mono text-[10px] tracking-widest uppercase text-text-dim">
              /{g.sectionLabel}
            </div>
            {g.items.map((item) => {
              const visible = !item.hidden;
              return (
                <div
                  key={item.key}
                  className="grid grid-cols-[1fr_220px_120px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 bg-surface hover:bg-surface-2 transition-colors"
                >
                  <div className="grid">
                    <span className="font-serif italic text-[15px] truncate">{item.label}</span>
                    <span className="mono text-[10px] tracking-wider text-text-mute truncate">
                      {item.key} · {item.href}
                    </span>
                  </div>
                  <div
                    className={`mono text-[10px] tracking-widest uppercase text-right ${
                      visible ? 'text-lime' : 'text-pink'
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
                        'relative inline-flex h-6 w-12 items-center transition-colors',
                        'border',
                        visible ? 'bg-lime/20 border-lime' : 'bg-bg border-border-2',
                        busyKey === item.key ? 'opacity-50' : '',
                      ].join(' ')}
                      title={visible ? 'Спрятать из меню' : 'Показывать в меню'}
                    >
                      <span
                        className={[
                          'inline-block h-4 w-4 transform transition-transform',
                          visible ? 'translate-x-7 bg-lime' : 'translate-x-1 bg-text-mute',
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
