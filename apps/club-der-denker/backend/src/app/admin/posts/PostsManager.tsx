'use client';

import { useEffect, useState, useCallback } from 'react';
import { MediaUpload } from '../MediaUpload';

const LOCALES = ['de', 'en', 'ru', 'es', 'fr', 'it'] as const;

interface Translation { locale: string; title: string; body: string }
interface Post {
  id: string;
  media_kind: string;
  media_url: string | null;
  published_at: string | null;
  cdd_feed_post_translations: Translation[];
}

/**
 * Community feed manager (spec 6): create / publish / delete admin posts. The
 * feed is read-only for users; only admins author posts here.
 */
export function PostsManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [locale, setLocale] = useState<(typeof LOCALES)[number]>('de');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState('text');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/posts');
    const json = await res.json();
    setPosts(json?.data?.posts ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(publish: boolean) {
    if (!title.trim()) return;
    setBusy(true);
    await fetch('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mediaKind,
        mediaUrl,
        publish,
        translation: { locale, title, body },
      }),
    });
    setTitle('');
    setBody('');
    setMediaUrl(null);
    setMediaKind('text');
    setBusy(false);
    load();
  }

  async function publishToggle(p: Post) {
    const tr = p.cdd_feed_post_translations[0] ?? { locale, title: '', body: '' };
    await fetch('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: p.id, publish: !p.published_at, translation: tr }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/posts?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-neutral-500">Локаль:</span>
          {LOCALES.map((l) => (
            <button key={l} onClick={() => setLocale(l)} className={`rounded-md px-2 py-1 text-xs ${locale === l ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <input className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" rows={3} placeholder="Текст" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="mb-3">
          <MediaUpload prefix="posts" value={mediaUrl} mediaKind={mediaKind} onUploaded={(url, kind) => { setMediaUrl(url); setMediaKind(kind); }} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => create(false)} disabled={busy} className="rounded-md bg-neutral-100 px-3 py-2 text-sm disabled:opacity-50">Черновик</button>
          <button onClick={() => create(true)} disabled={busy} className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">Опубликовать</button>
        </div>
      </div>

      <div className="space-y-2">
        {posts.map((p) => {
          const tr = p.cdd_feed_post_translations[0];
          return (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
              <div>
                <div className="text-sm font-medium">{tr?.title ?? '(без заголовка)'}</div>
                <div className="text-xs text-neutral-500">{p.published_at ? 'Опубликовано' : 'Черновик'}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => publishToggle(p)} className="rounded-md bg-neutral-100 px-2 py-1 text-xs">
                  {p.published_at ? 'Снять' : 'Опубликовать'}
                </button>
                <button onClick={() => remove(p.id)} className="rounded-md px-2 py-1 text-xs text-red-600">Удалить</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
