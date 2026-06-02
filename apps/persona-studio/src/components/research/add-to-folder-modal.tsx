'use client';

// Универсальная модалка «Добавить в папку». Используется и на карточке
// рилса (itemType='reel'), и на странице автора (itemType='author'),
// и из recommendation-карточек (itemType='idea').
//
// Сама грузит список папок нужного типа лениво при открытии.

import { useEffect, useState } from 'react';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="border border-border bg-bg max-w-md w-full p-5 grid gap-4"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-serif text-[17px] text-text">
            Добавить в папку «{folderType === 'bloggers' ? 'Блогеры' : folderType === 'videos' ? 'Видео' : 'Идеи'}»
          </h3>
          <button onClick={onClose} className="mono text-[14px] text-text-mute hover:text-text">
            ×
          </button>
        </div>

        {loading && (
          <div className="mono text-[10px] tracking-widest uppercase text-text-mute">Загружаю…</div>
        )}

        {!loading && folders.length === 0 && !creatingNew && (
          <div className="font-serif italic text-[13px] text-text-mute">
            Папок этого типа ещё нет — создай первую.
          </div>
        )}

        {!loading && folders.length > 0 && (
          <div className="grid gap-1 max-h-60 overflow-y-auto">
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => addToFolder(f.id)}
                disabled={Boolean(busy)}
                className="text-left border border-border-soft hover:border-gold bg-surface p-2 flex justify-between items-center"
              >
                <span className="font-serif text-[14px] text-text">{f.name}</span>
                <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
                  {f.itemCount} {busy === f.id && '· …'}
                </span>
              </button>
            ))}
          </div>
        )}

        {creatingNew ? (
          <div className="grid gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
              placeholder="Название новой папки"
              className="bg-bg border border-border focus:border-gold outline-none px-2 py-1.5 font-serif text-[14px] text-text"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreatingNew(false)}
                className="btn-ghost text-[10px] tracking-widest uppercase"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={createAndAdd}
                disabled={busy === 'new' || newName.trim().length === 0}
                className="btn-primary text-[10px] tracking-widest uppercase"
              >
                {busy === 'new' ? '…' : 'Создать + добавить'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingNew(true)}
            className="mono text-[10px] tracking-widest uppercase text-lime hover:text-gold text-left"
          >
            + Создать новую папку
          </button>
        )}

        {error && (
          <div className="border border-pink/40 bg-pink/5 px-2 py-1 mono text-[10px] text-pink">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
