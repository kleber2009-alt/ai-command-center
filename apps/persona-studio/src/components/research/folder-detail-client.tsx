'use client';

// Папка изнутри: показывает свои items (рилсы/авторы/идеи). Поддерживает
// удаление item'ов и переименование папки.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Flame, Pencil, Sparkles, X } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { igProxy } from './types';

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
      <div className="panel relative overflow-hidden !rounded-[28px] p-6 md:p-8 flex justify-between items-center gap-4 reveal">
        <div className="hero-gradient pointer-events-none absolute inset-0" />
        <div className="relative flex min-w-0 flex-1 items-center gap-4">
          <Icon3D name={folder.type === 'bloggers' ? 'bloggers' : folder.type === 'videos' ? 'videos' : 'folders'} size={36} tile />
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="input !text-[22px] !font-semibold flex-1"
            />
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="group flex items-center gap-2 truncate text-[30px] font-semibold tracking-[-0.02em] text-text cursor-text"
              title="Кликни чтобы переименовать"
            >
              {folder.name}
              <Pencil className="h-4 w-4 flex-none text-text-mute opacity-0 transition-opacity group-hover:opacity-100" />
            </h1>
          )}
        </div>
        <span className="eyebrow relative tabular-nums">
          {items.length} · {folder.type}
        </span>
      </div>

      {items.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-10 flex flex-col items-center gap-3 text-center text-[15px] text-text-dim fade-in">
          <Icon3D name="folders" size={40} tile />
          Пусто. Добавляй сюда {folder.type === 'bloggers' ? 'блогеров со страницы автора' : folder.type === 'videos' ? 'рилсы из выдачи' : 'идеи из рекомендаций'}.
        </div>
      )}

      {folder.type === 'videos' && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger">
          {items.map((it) =>
            it.reel ? (
              <article key={it.id} className="card-editorial group relative overflow-hidden">
                <Link href={`/research/${it.reel.id}`} className="relative block aspect-[4/5] overflow-hidden rounded-t-[23px] bg-white/[0.03]">
                  {it.reel.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={igProxy(it.reel.thumbnailUrl)}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-500 ease-settle group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon3D name="video" size={40} />
                    </div>
                  )}
                  {it.reel.virality != null && (
                    <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-bold tabular-nums text-gold backdrop-blur-md">
                      <Flame className="h-3.5 w-3.5" />
                      {it.reel.virality.toFixed(1)}×
                    </span>
                  )}
                </Link>
                <div className="px-4 py-3 grid gap-1">
                  <span className="text-[13px] font-medium text-text">@{it.reel.author.username}</span>
                  <span className="text-[12.5px] text-text-dim line-clamp-1">{it.reel.caption}</span>
                  <span className="text-[12px] tabular-nums text-text-mute">
                    {fmt(it.reel.views)} просм · ER {it.reel.engagementRate?.toFixed(1) ?? '—'}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it)}
                  disabled={busy}
                  className="absolute top-2.5 right-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-text backdrop-blur-md transition-colors hover:border-pink/60 hover:text-pink"
                  aria-label="Убрать из папки"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </article>
            ) : null,
          )}
        </div>
      )}

      {folder.type === 'bloggers' && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
          {items.map((it) =>
            it.author ? (
              <article key={it.id} className="card-editorial p-4 flex items-center gap-3">
                {it.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={igProxy(it.author.avatarUrl)}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover bg-white/[0.05] ring-1 ring-white/10"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white/[0.05] ring-1 ring-white/10" />
                )}
                <div className="flex-1 grid gap-0.5 min-w-0">
                  <Link
                    href={`/research/author/${it.author.username}`}
                    className="text-[14px] font-semibold text-text hover:text-gold truncate transition-colors"
                  >
                    @{it.author.username}
                  </Link>
                  <span className="text-[12px] tabular-nums text-text-mute">
                    {fmt(it.author.followers)} · мед. {fmt(it.author.medianViews)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it)}
                  disabled={busy}
                  className="btn-icon !h-8 !w-8 hover:!text-pink"
                  aria-label="Убрать из папки"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </article>
            ) : null,
          )}
        </div>
      )}

      {folder.type === 'ideas' && items.length > 0 && (
        <div className="grid gap-2.5 stagger">
          {items.map((it) => (
            <article key={it.id} className="panel p-4 flex justify-between gap-3 items-start">
              <Sparkles className="mt-0.5 h-4 w-4 flex-none text-lime" />
              <p className="text-[14.5px] leading-snug text-text flex-1">{it.note || it.itemId}</p>
              <button
                type="button"
                onClick={() => removeItem(it)}
                disabled={busy}
                className="btn-icon !h-8 !w-8 hover:!text-pink"
                aria-label="Убрать из папки"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
