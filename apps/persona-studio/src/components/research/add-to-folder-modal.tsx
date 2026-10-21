'use client';

// Универсальная модалка «Добавить в папку». Используется и на карточке
// рилса (itemType='reel'), и на странице автора (itemType='author'),
// и из recommendation-карточек (itemType='idea').
//
// Сама грузит список папок нужного типа лениво при открытии.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';

type ItemType = 'reel' | 'author' | 'idea';
const ITEM_TYPE_TO_FOLDER_TYPE: Record<ItemType, 'bloggers' | 'videos' | 'ideas'> = {
  author: 'bloggers',
  reel: 'videos',
  idea: 'ideas',
};

type Folder = { id: string; name: string; itemCount: number };

export function AddToFolderModal({
  itemType,
  itemId,
  note,
  onClose,
  onAdded,
}: {
  itemType: ItemType;
  itemId: string;
  note?: string;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const folderType = ITEM_TYPE_TO_FOLDER_TYPE[itemType];
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | 'new' | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    fetch(`/api/research/folders?type=${folderType}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setFolders(
            j.folders.map((f: { id: string; name: string; _count: { items: number } }) => ({
              id: f.id,
              name: f.name,
              itemCount: f._count.items,
            })),
          );
        }
      })
      .finally(() => setLoading(false));
  }, [folderType]);

  async function addToFolder(folderId: string) {
    setBusy(folderId);
    setError(null);
    try {
      const res = await fetch(`/api/research/folders/${folderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId, note }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      onAdded?.();
      onClose();
    } finally {
      setBusy(null);
    }
  }

  async function createAndAdd() {
    if (newName.trim().length === 0) return;
    setBusy('new');
    setError(null);
    try {
      const cr = await fetch('/api/research/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: folderType }),
      });
      const crJson = await cr.json();
      if (!cr.ok) {
        setError(crJson.message || crJson.error || `HTTP ${cr.status}`);
        return;
      }
      await addToFolder(crJson.folder.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel !bg-surface/95 shadow-glass max-w-md w-full p-6 grid gap-4 pop-in"
      >
        <div className="flex justify-between items-center gap-3">
          <h3 className="flex items-center gap-3 text-[17px] font-semibold tracking-[-0.02em] text-text">
            <Icon3D name="folders" size={22} tile />
            Добавить в папку «{folderType === 'bloggers' ? 'Блогеры' : folderType === 'videos' ? 'Видео' : 'Идеи'}»
          </h3>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn-icon !h-8 !w-8 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="grid gap-2">
            <div className="skeleton h-11" />
            <div className="skeleton h-11" />
          </div>
        )}

        {!loading && folders.length === 0 && !creatingNew && (
          <div className="text-[14px] text-text-mute">
            Папок этого типа ещё нет — создай первую.
          </div>
        )}

        {!loading && folders.length > 0 && (
          <div className="grid gap-1.5 max-h-60 overflow-y-auto">
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => addToFolder(f.id)}
                disabled={Boolean(busy)}
                className="text-left rounded-2xl border border-border-soft bg-white/[0.04] px-4 py-3 flex justify-between items-center transition-colors hover:border-gold/50 hover:bg-blue/[0.08] disabled:opacity-60"
              >
                <span className="text-[14px] font-medium text-text">{f.name}</span>
                <span className="text-[12px] tabular-nums text-text-mute">
                  {f.itemCount} {busy === f.id && '· …'}
                </span>
              </button>
            ))}
          </div>
        )}

        {creatingNew ? (
          <div className="grid gap-2.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
              placeholder="Название новой папки"
              className="input"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreatingNew(false)}
                className="btn-ghost !px-4 !py-2 !text-[13px]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={createAndAdd}
                disabled={busy === 'new' || newName.trim().length === 0}
                className="btn-primary !px-4 !py-2 !text-[13px]"
              >
                {busy === 'new' ? '…' : 'Создать + добавить'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingNew(true)}
            className="inline-flex items-center gap-1.5 justify-self-start rounded-full px-3 py-1.5 text-[13px] font-medium text-lime transition-colors hover:bg-lime/[0.08]"
          >
            <Plus className="h-4 w-4" />
            Создать новую папку
          </button>
        )}

        {error && (
          <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-3.5 py-2 text-[13px] text-pink">
            {error}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}

// Overlays render into <body>: an animated ancestor (filter/transform) would
// otherwise become the containing block for `position: fixed`.
function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
