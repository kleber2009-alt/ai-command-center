'use client';

import { useState, useRef } from 'react';

/**
 * Admin media upload widget (spec 6). Uploads to /api/admin/upload and reports
 * the resulting public URL + media kind. Shows a thumbnail / video preview.
 */
export function MediaUpload({
  prefix,
  value,
  mediaKind,
  onUploaded,
}: {
  prefix: 'items' | 'posts';
  value: string | null;
  mediaKind?: string;
  onUploaded: (url: string, mediaKind: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('prefix', prefix);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json?.error?.message ?? 'upload failed');
      onUploaded(json.data.url, json.data.mediaKind);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        mediaKind === 'video' ? (
          <video src={value} className="h-32 rounded-md" controls />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-32 rounded-md object-cover" />
        )
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md bg-neutral-100 px-3 py-2 text-xs disabled:opacity-50"
      >
        {busy ? 'Загрузка…' : value ? 'Заменить медиа' : 'Загрузить медиа'}
      </button>
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
