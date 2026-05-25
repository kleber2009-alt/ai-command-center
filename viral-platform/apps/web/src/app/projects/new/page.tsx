'use client';

import { trpc } from '@/lib/trpc';
import { MAX_UPLOAD_BYTES } from '@vp/shared';
import { UploadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ACCEPTED = ['video/mp4', 'video/quicktime'] as const;
type Accepted = (typeof ACCEPTED)[number];

/** Direct-to-R2 upload via a presigned PUT, then create the project (§5.1). */
export default function NewProjectPage() {
  const router = useRouter();
  const presign = trpc.uploads.presign.useMutation();
  const create = trpc.projects.create.useMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!(ACCEPTED as readonly string[]).includes(file.type))
      return setError('Only MP4 or MOV files are supported.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('File exceeds the 5 GB limit.');

    setBusy(true);
    try {
      const { url, key } = await presign.mutateAsync({
        filename: file.name,
        contentType: file.type as Accepted,
        sizeBytes: file.size,
      });
      const put = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!put.ok) throw new Error('Upload failed');

      const durationMs = await probeDuration(file).catch(() => 0);
      const { projectId } = await create.mutateAsync({
        r2Key: key,
        filename: file.name,
        durationMs,
        sizeBytes: file.size,
      });
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">New project</h1>
      <label
        className="mt-8 flex h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card text-muted hover:border-primary"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
      >
        <UploadCloud size={40} />
        <span>{busy ? 'Uploading…' : 'Drag & drop a video, or click to choose'}</span>
        <input
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </main>
  );
}

/** Read duration client-side via a hidden <video> element. */
function probeDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.round(video.duration * 1000));
    };
    video.onerror = () => reject(new Error('probe failed'));
    video.src = URL.createObjectURL(file);
  });
}
