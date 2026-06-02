'use client';

import { useEffect, useState, useCallback } from 'react';
import { MediaUpload } from '../MediaUpload';

const LOCALES = ['de', 'en', 'ru', 'es', 'fr', 'it'] as const;
type Locale = (typeof LOCALES)[number];

interface Option { key: string; label: string; feedback: string }
interface Translation { locale: string; body: string; options: Option[] }
interface Item {
  id: string;
  global_order: number | null;
  day_index: number | null;
  day_slot: number | null;
  media_kind: string;
  media_url: string | null;
  cdd_item_translations: Translation[];
}

/**
 * Course content editor (spec 6). Lists the 112 course items grouped by day and
 * edits the body + 3-4 answer options for the selected locale via /api/admin/items.
 */
export function ContentEditor() {
  const [items, setItems] = useState<Item[]>([]);
  const [locale, setLocale] = useState<Locale>('de');
  const [editing, setEditing] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/items?kind=course');
    const json = await res.json();
    setItems(json?.data?.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-neutral-500">Загрузка…</p>;

  const byDay = new Map<number, Item[]>();
  for (const it of items) {
    if (it.day_index == null) continue;
    if (!byDay.has(it.day_index)) byDay.set(it.day_index, []);
    byDay.get(it.day_index)!.push(it);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-neutral-500">Локаль:</span>
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`rounded-md px-2 py-1 text-xs ${locale === l ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[...byDay.keys()].sort((a, b) => a - b).map((day) => (
          <div key={day} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-2 text-sm font-medium">День {day}</div>
            <ul className="space-y-1 text-sm">
              {byDay.get(day)!
                .sort((a, b) => (a.day_slot ?? 0) - (b.day_slot ?? 0))
                .map((it) => {
                  const tr = it.cdd_item_translations.find((t) => t.locale === locale);
                  const filled = tr && tr.body.trim().length > 0;
                  return (
                    <li key={it.id}>
                      <button onClick={() => setEditing(it)} className="text-left hover:underline">
                        Элемент {it.day_slot}{' '}
                        <span className={filled ? 'text-green-600' : 'text-neutral-400'}>
                          {filled ? '✓' : 'не заполнен'}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>

      {editing ? (
        <ItemModal
          item={editing}
          locale={locale}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function ItemModal({ item, locale, onClose, onSaved }: { item: Item; locale: Locale; onClose: () => void; onSaved: () => void }) {
  const existing = item.cdd_item_translations.find((t) => t.locale === locale);
  const [body, setBody] = useState(existing?.body ?? '');
  const [options, setOptions] = useState<Option[]>(
    existing?.options?.length ? existing.options : [{ key: 'a', label: '', feedback: '' }, { key: 'b', label: '', feedback: '' }],
  );
  const [mediaUrl, setMediaUrl] = useState<string | null>(item.media_url);
  const [mediaKind, setMediaKind] = useState<string>(item.media_kind);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch('/api/admin/items', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, locale, body, options }),
    });
    setBusy(false);
    onSaved();
  }

  async function onMedia(url: string, kind: string) {
    setMediaUrl(url);
    setMediaKind(kind);
    // Media is shared across locales — persist immediately on the item.
    await fetch('/api/admin/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, mediaKind: kind, mediaUrl: url }),
    });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-sm font-medium">
          День {item.day_index}, элемент {item.day_slot} · {locale.toUpperCase()}
        </div>
        <textarea
          className="mb-4 w-full rounded-md border border-neutral-300 p-2 text-sm"
          rows={4}
          placeholder="Текст элемента"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mb-4">
          <MediaUpload prefix="items" value={mediaUrl} mediaKind={mediaKind} onUploaded={onMedia} />
        </div>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input className="w-10 rounded-md border border-neutral-300 px-2 py-1 text-sm" value={o.key} onChange={(e) => upd(i, 'key', e.target.value)} />
              <input className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="Вариант" value={o.label} onChange={(e) => upd(i, 'label', e.target.value)} />
              <input className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="Фидбэк" value={o.feedback} onChange={(e) => upd(i, 'feedback', e.target.value)} />
            </div>
          ))}
        </div>
        {options.length < 4 ? (
          <button onClick={() => setOptions([...options, { key: String.fromCharCode(97 + options.length), label: '', feedback: '' }])} className="mt-2 text-xs text-neutral-500 hover:underline">
            + вариант
          </button>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm">Отмена</button>
          <button onClick={save} disabled={busy} className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">Сохранить</button>
        </div>
      </div>
    </div>
  );

  function upd(i: number, field: keyof Option, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, [field]: value } : o)));
  }
}
