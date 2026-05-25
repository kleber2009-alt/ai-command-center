'use client';

import { trpc } from '@/lib/trpc';
import { useProjectProgress } from '@/lib/useProjectProgress';
import { PROJECT_STATUS } from '@vp/shared';
import Link from 'next/link';
import { use } from 'react';

const STAGES = PROJECT_STATUS.filter((s) => s !== 'failed' && s !== 'done');

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const progress = useProjectProgress(id);
  const project = trpc.projects.get.useQuery({ id }, { refetchInterval: progress ? false : 5000 });

  const status = progress?.status ?? project.data?.project.status ?? 'uploaded';
  const reviewable = status === 'ready_for_review' || status === 'done';

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-muted hover:text-foreground">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{project.data?.project.filename ?? 'Project'}</h1>

      <ol className="mt-8 space-y-3">
        {STAGES.map((stage) => {
          const reached =
            STAGES.indexOf(stage) <= STAGES.indexOf(status as (typeof STAGES)[number]);
          const active = stage === status;
          return (
            <li key={stage} className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${reached ? 'bg-primary' : 'bg-border'}`} />
              <span className={`capitalize ${active ? 'font-semibold' : 'text-muted'}`}>
                {stage.replace(/_/g, ' ')}
              </span>
              {active && progress?.message && (
                <span className="text-sm text-muted">— {progress.message}</span>
              )}
            </li>
          );
        })}
      </ol>

      {status === 'failed' && (
        <p className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {project.data?.project.failureReason ?? 'Processing failed. Your credits were refunded.'}
        </p>
      )}

      {reviewable && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Clips</h2>
          <div className="mt-4 grid gap-3">
            {project.data?.clips.map((clip) => (
              <Link
                key={clip.id}
                href={`/projects/${id}/clips/${clip.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:border-primary"
              >
                <span className="font-medium">
                  {clip.title || `Clip ${clip.startMs}–${clip.endMs}ms`}
                </span>
                <span className="text-sm text-muted">
                  Viral {Math.round(clip.viralScore * 100)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
