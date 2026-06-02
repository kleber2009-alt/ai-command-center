'use client';

// Главный экран папок: 3 группы (Блогеры / Видео / Идеи), плюс кнопка
// создать новую папку в выбранной группе.

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type FolderType = 'bloggers' | 'videos' | 'ideas';
type Folder = {
  id: string;
  name: string;
  type: FolderType;
  itemCount: number;
  createdAt: string;
};

const TYPE_META: Record<FolderType, { label: string; hint: string; tone: 'gold' | 'lime' | 'cyan' }> = {
  bloggers: { label: 'Блогеры', hint: 'конкуренты под наблюдением', tone: 'gold' },
  videos: { label: 'Видео', hint: 'залётные ролики на разбор', tone: 'lime' },
  ideas: { label: 'Идеи', hint: 'action-пункты из рекомендаций', tone: 'cyan' },
};

export function FoldersClient({ initialFolders }: { initialFolders: Folder[] }) {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [creating, setCreating] = useState<FolderType | null>(null);
  const [name, setName] = useState('');
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function startCreate(type: FolderType) {
    setCreating(type);
    setName('');
    setError(null);
  }

  function submitCreate() {
    if (!creating) return;
    if (name.trim().length < 1) {
      setError('Название не может быть пустым');
      return;
    }
    startTransition(async () => {
      const res = await fetch('/api/research/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: creating }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      setFolders((f) => [
        {
          id: json.folder.id,
          name: json.folder.name,
          type: json.folder.type as FolderType,
          itemCount: 0,
          createdAt: json.folder.createdAt,
        },
        ...f,
      ]);
      setCreating(null);
      setName('');
      router.refresh();
    });
  }

  function deleteFolder(id: string) {
    if (!confirm('Удалить папку? Все её записи будут потеряны.')) return;
    startTransition(async () => {
      const res = await fetch(`/api/research/folders/${id}`, { method: 'DELETE' });
      if (res.ok) setFolders((f) => f.filter((x) => x.id !== id));
    });
  }

  const byType: Record<FolderType, Folder[]> = {
    bloggers: folders.filter((f) => f.type === 'bloggers'),
    videos: folders.filter((f) => f.type === 'videos'),
    ideas: folders.filter((f) => f.type === 'ideas'),
  };

  return (
    <div className="grid gap-6">
      {error && (
        <div className="border border-pink/40 bg-pink/5 px-3 py-2 mono text-[11px] text-pink">{error}</div>
      )}
      {(Object.keys(TYPE_META) as FolderType[]).map((type) => {
        const meta = TYPE_META[type];
        const list = byType[type];
        const toneCls =
          meta.tone === 'gold'
            ? 'text-gold border-gold/40'
            : meta.tone === 'lime'
              ? 'text-lime border-lime/40'
              : 'text-cyan border-cyan/40';
        return (
          <section key={type} className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className={`mono text-[10px] tracking-widest uppercase ${toneCls.split(' ')[0]}`}>
                  {meta.label}
                </h2>
                <span className="font-serif italic text-[13px] text-text-mute">{meta.hint}</span>
              </div>
              <button
                type="button"
                onClick={() => startCreate(type)}
                className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text"
              >
                + Создать
              </button>
            </div>

            {creating === type && (
              <div className="border border-border bg-surface p-3 flex gap-2 items-end">
                <div className="flex-1 grid gap-1">
                  <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
                    Название
                  </span>
                  <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitCreate();
                      if (e.key === 'Escape') setCreating(null);
                    }}
                    placeholder={
                      type === 'bloggers'
                        ? 'B2B-эксперты'
                        : type === 'videos'
                          ? 'Хуки про деньги'
                          : 'Идеи на октябрь'
                    }
                    className="bg-bg border border-border focus:border-gold outline-none px-2 py-1.5 font-serif text-[14px] text-text"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={busy}
                  className="btn-primary text-[10px] tracking-widest uppercase"
                >
                  {busy ? '…' : 'Создать'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(null)}
                  className="btn-ghost text-[10px] tracking-widest uppercase"
                >
                  Отмена
                </button>
              </div>
            )}

            {list.length === 0 && creating !== type && (
              <div className="border border-border-soft bg-surface/50 px-4 py-6 font-serif italic text-[14px] text-text-mute text-center">
                Папок типа «{meta.label}» пока нет.
              </div>
            )}

            {list.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {list.map((f) => (
                  <Link
                    key={f.id}
                    href={`/research/folders/${f.id}`}
                    className={`border ${toneCls} bg-surface p-3 grid gap-1 hover:border-text relative group`}
                  >
                    <div className="flex justify-between items-baseline">
                      <span className="font-serif text-[15px] text-text truncate">{f.name}</span>
                      <span className={`mono text-[10px] tracking-wider ${toneCls.split(' ')[0]}`}>
                        {f.itemCount}
                      </span>
                    </div>
                    <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
                      {meta.label}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteFolder(f.id);
                      }}
                      className="absolute top-1 right-1 mono text-[10px] text-text-mute hover:text-pink opacity-0 group-hover:opacity-100 px-1"
                      aria-label="delete"
                    >
                      ✕
                    </button>
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
