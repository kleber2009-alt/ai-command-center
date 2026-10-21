'use client';

// Главный экран папок: 3 группы (Блогеры / Видео / Идеи), плюс кнопка
// создать новую папку в выбранной группе.

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Folder as FolderIcon, Plus, Trash2 } from 'lucide-react';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';

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
    <div className="grid gap-8">
      {error && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink">{error}</div>
      )}
      {(Object.keys(TYPE_META) as FolderType[]).map((type, idx) => {
        const meta = TYPE_META[type];
        const list = byType[type];
        const toneCls =
          meta.tone === 'gold'
            ? 'text-gold bg-blue/[0.12]'
            : meta.tone === 'lime'
              ? 'text-lime bg-lime/[0.12]'
              : 'text-cyan bg-cyan/[0.12]';
        return (
          <section key={type} className="grid gap-4 reveal" style={{ ['--i' as string]: idx } as React.CSSProperties}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="sec-num">/{String(idx + 1).padStart(2, '0')}</span>
                <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-text">
                  <Icon3D name={TYPE_ICON[type]} size={22} />
                  {meta.label}
                </h2>
                <span className="sec-title">{meta.hint}</span>
              </div>
              <button
                type="button"
                onClick={() => startCreate(type)}
                className="btn-ghost !px-4 !py-2 !text-[13px]"
              >
                <Plus className="h-4 w-4" />
                Создать
              </button>
            </div>

            {creating === type && (
              <div className="panel p-4 flex flex-wrap gap-2 items-end pop-in">
                <div className="flex-1 min-w-[200px] grid gap-1.5">
                  <span className="text-[12px] text-text-mute">
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
                    className="input"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={busy}
                  className="btn-primary"
                >
                  {busy ? '…' : 'Создать'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(null)}
                  className="btn-ghost"
                >
                  Отмена
                </button>
              </div>
            )}

            {list.length === 0 && creating !== type && (
              <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] px-4 py-7 text-[14px] text-text-mute text-center">
                Папок типа «{meta.label}» пока нет.
              </div>
            )}

            {list.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
                {list.map((f) => (
                  <Link
                    key={f.id}
                    href={`/research/folders/${f.id}`}
                    className="card-editorial group flex items-center gap-3.5 p-4"
                  >
                    <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl ${toneCls}`}>
                      <FolderIcon className="h-5 w-5" />
                    </span>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-[15px] font-semibold tracking-[-0.01em] text-text truncate">{f.name}</span>
                      <span className="text-[12px] text-text-mute">
                        {meta.label} · <span className="tabular-nums">{f.itemCount}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteFolder(f.id);
                      }}
                      className="btn-icon !h-8 !w-8 opacity-0 group-hover:opacity-100 hover:!text-pink"
                      aria-label="delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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

const TYPE_ICON: Record<FolderType, Icon3DName> = { bloggers: 'bloggers', videos: 'videos', ideas: 'sparkles' };
