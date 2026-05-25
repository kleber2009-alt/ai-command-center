'use client';

import { trpc } from '@/lib/trpc';
import type { BRollInsert, ExportFormat } from '@vp/shared';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';

/**
 * Clip editor (§8.2). MVP shows the AI B-roll plan with per-insert manual
 * replacement and an export action. The Remotion player, timeline tracks, and
 * caption-preset picker layer on top of this data in week 4 (§11).
 */
export default function ClipEditorPage({
  params,
}: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = use(params);
  const utils = trpc.useUtils();
  const clip = trpc.clips.get.useQuery({ clipId });
  const regenerate = trpc.clips.regenerateBroll.useMutation({
    onSuccess: () => utils.clips.get.invalidate({ clipId }),
  });
  const startRender = trpc.renders.start.useMutation();
  const [format, setFormat] = useState<ExportFormat>('9:16');

  const inserts = (clip.data?.brollPlan?.inserts ?? []) as BRollInsert[];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-foreground">
        ← Back to project
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{clip.data?.clip.title ?? 'Clip'}</h1>
          <p className="mt-1 text-sm text-muted">
            Viral {Math.round((clip.data?.clip.viralScore ?? 0) * 100)} · Hook{' '}
            {Math.round((clip.data?.clip.hookScore ?? 0) * 100)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
          </select>
          <button
            type="button"
            onClick={() =>
              startRender.mutate({ clipId, format, quality: '1080p', captionPreset: 'hormozi' })
            }
            className="rounded-lg bg-primary px-4 py-2 font-medium text-white"
          >
            {startRender.isPending ? 'Starting…' : 'Export'}
          </button>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">B-Roll ({inserts.length})</h2>
          <button
            type="button"
            onClick={() => regenerate.mutate({ clipId })}
            className="flex items-center gap-2 text-sm text-muted hover:text-foreground"
          >
            <RefreshCw size={16} /> Regenerate
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inserts.map((ins, i) => (
            <article
              key={`${ins.assetId}-${i}`}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <img
                src={ins.thumbnailUrl}
                alt={ins.query}
                className="aspect-video w-full object-cover"
              />
              <div className="p-3">
                <p className="font-medium">{ins.query}</p>
                <p className="mt-1 text-xs text-muted">
                  {(ins.startMs / 1000).toFixed(1)}s–{(ins.endMs / 1000).toFixed(1)}s ·{' '}
                  {ins.overlayStyle} · {Math.round(ins.confidence * 100)}%
                </p>
                <p className="mt-1 text-xs text-muted">{ins.reason}</p>
              </div>
            </article>
          ))}
          {inserts.length === 0 && !clip.isLoading && (
            <p className="text-muted">No B-roll planned for this clip.</p>
          )}
        </div>
      </section>
    </main>
  );
}
