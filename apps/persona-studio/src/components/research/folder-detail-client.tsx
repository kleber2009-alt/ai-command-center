'use client';

// Папка изнутри: показывает свои items (рилсы/авторы/идеи). Поддерживает
// удаление item'ов и переименование папки.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type FolderType = 'bloggers' | 'videos' | 'ideas';
type ReelItem = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  views: number;
  virality: number | null;
  engagementRate: number | null;
  author: { username: string; avatarUrl: string | null };
};
type AuthorItem = {
  id: string;
  username: string;
  avatarUrl: string | null;
  followers: number | null;
  medianViews: number | null;
};
type Item = {
  id: string;
  itemType: 'reel' | 'author' | 'idea';
  itemId: string;
  note: string | null;
  createdAt: string;
  reel: ReelItem | null;
  author: AuthorItem | null;
};

const fmt = (n: number | null) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

export function FolderDetailClient({
  folder,
  items: initialItems,
}: {
  folder: { id: string; name: string; type: FolderType };
  items: Item[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [name, setName] = useState(folder.name);
  const [editingName, setEditingName] = useState(false);
  const [busy, startTransition] = useTransition();

  function saveName() {
    if (name.trim() === folder.name || name.trim().length === 0) {
      setEditingName(false);
      setName(folder.name);
      return;
    }
    startTransition(async () => {
      await fetch(`/api/research/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      setEditingName(false);
      router.refresh();
    });
  }

  function removeItem(item: Item) {
    startTransition(async () => {
      await fetch(`/api/research/folders/${folder.id}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: item.itemType, itemId: item.itemId }),
      });
      setItems((arr) => arr.filter((x) => x.id !== item.id));
    });
  }

  return (
    <div className="grid gap-5">
      <div className="border border-border bg-surface p-4 flex justify-between items-center gap-3">
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            className="font-serif text-[22px] text-text bg-bg border border-border focus:border-gold outline-none px-2 py-1 flex-1"
          />
        ) : (
          <h1
            onClick={() => setEditingName(true)}
            className="font-serif text-[22px] text-text cursor-text"
            title="Кликни чтобы переименовать"
          >
            {folder.name}
          </h1>
        )}
        <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
          {items.length} · {folder.type}
        </span>
      </div>

      {items.length === 0 && (
        <div className="border border-border-soft bg-surface/50 p-8 text-center font-serif italic text-[15px] text-text-dim">
          Пусто. Добавляй сюда {folder.type === 'bloggers' ? 'блогеров со страницы автора' : folder.type === 'videos' ? 'рилсы из выдачи' : 'идеи из рекомендаций'}.
        </div>
      )}

      {folder.type === 'videos' && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0.5 bg-border-soft">
          {items.map((it) =>
            it.reel ? (
              <article key={it.id} className="border border-border bg-surface relative">
                <Link href={`/research/${it.reel.id}`} className="block aspect-[4/5] bg-bg overflow-hidden">
                  {it.reel.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.reel.thumbnailUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center mono text-[9px] tracking-widest uppercase text-text-mute">
                      REEL
                    </div>
                  )}
                  {it.reel.virality != null && (
                    <span className="absolute top-2 left-2 px-2 py-1 bg-black/85 mono text-[12px] tracking-wider text-gold">
                      🔥 {it.reel.virality.toFixed(1)}×
                    </span>
                  )}
                </Link>
                <div className="px-3 py-2 grid gap-1">
                  <span className="mono text-[10px] tracking-wider text-text">@{it.reel.author.username}</span>
                  <span className="font-serif text-[12px] text-text-dim line-clamp-1">{it.reel.caption}</span>
                  <span className="mono text-[10px] text-text-mute">
                    {fmt(it.reel.views)} просм · ER {it.reel.engagementRate?.toFixed(1) ?? '—'}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it)}
                  disabled={busy}
                  className="absolute top-2 right-2 px-1.5 py-1 bg-black/80 mono text-[10px] text-text-mute hover:text-pink"
                  aria-label="remove"
                >
                  ✕
                </button>
              </article>
            ) : null,
          )}
        </div>
      )}

      {folder.type === 'bloggers' && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((it) =>
            it.author ? (
              <article key={it.id} className="border border-border bg-surface p-3 flex items-center gap-3 relative">
                {it.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.author.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover bg-bg border border-border"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-bg border border-border" />
                )}
                <div className="flex-1 grid gap-0.5 min-w-0">
                  <Link
                    href={`/research/author/${it.author.username}`}
                    className="mono text-[12px] tracking-wider text-text hover:text-lime truncate"
                  >
                    @{it.author.username}
                  </Link>
                  <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
                    {fmt(it.author.followers)} · мед. {fmt(it.author.medianViews)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it)}
                  disabled={busy}
                  className="mono text-[10px] text-text-mute hover:text-pink"
                  aria-label="remove"
                >
                  ✕
                </button>
              </article>
            ) : null,
          )}
        </div>
      )}

      {folder.type === 'ideas' && items.length > 0 && (
        <div className="grid gap-2">
          {items.map((it) => (
            <article key={it.id} className="border border-border bg-surface p-3 flex justify-between gap-3 items-start">
              <p className="font-serif text-[14px] leading-snug text-text flex-1">{it.note || it.itemId}</p>
              <button
                type="button"
                onClick={() => removeItem(it)}
                disabled={busy}
                className="mono text-[10px] text-text-mute hover:text-pink"
                aria-label="remove"
              >
                ✕
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
