'use client';

import { trpc } from '@/lib/trpc';
import { UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

async function sha256(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** User media library (§4.4.6): collections, upload, semantic search, grid. */
export default function LibraryPage() {
  const utils = trpc.useUtils();
  const collections = trpc.library.listCollections.useQuery();
  const [collectionId, setCollectionId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const assets = trpc.library.listAssets.useQuery({
    collectionId,
    search: search || undefined,
    limit: 40,
  });

  const uploadInit = trpc.library.uploadInit.useMutation();
  const uploadComplete = trpc.library.uploadComplete.useMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList) {
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const {
          url,
          key,
          collectionId: cid,
        } = await uploadInit.mutateAsync({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          collectionId,
        });
        const put = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!put.ok) throw new Error(`Upload failed for ${file.name}`);
        await uploadComplete.mutateAsync({
          r2Key: key,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          fileHash: await sha256(file),
          collectionId: cid,
        });
      }
      await utils.library.listAssets.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Library</h1>
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground">
          Dashboard →
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCollectionId(undefined)}
          className={`rounded-full border px-3 py-1 text-sm ${!collectionId ? 'border-primary' : 'border-border'}`}
        >
          All
        </button>
        {collections.data?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCollectionId(c.id)}
            className={`rounded-full border px-3 py-1 text-sm ${collectionId === c.id ? 'border-primary' : 'border-border'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Semantic search… (e.g. 'calm ocean at sunset')"
          className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
          <UploadCloud size={16} /> {busy ? 'Uploading…' : 'Upload'}
          <input
            type="file"
            multiple
            accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {assets.data?.items.length === 0 && (
          <p className="text-muted">
            No assets yet. Upload videos or images to build your library.
          </p>
        )}
        {assets.data?.items.map((a) => (
          <article key={a.id} className="overflow-hidden rounded-xl border border-border bg-card">
            {a.thumbnailUrl ? (
              <img src={a.thumbnailUrl} alt="" className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-xs text-muted">
                {'status' in a && a.status === 'processing' ? 'Indexing…' : 'No preview'}
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
