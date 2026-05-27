'use client';

import { AUTH_DISABLED } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { UserButton } from '@clerk/nextjs';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const projects = trpc.projects.list.useQuery({ limit: 20 });
  const balance = trpc.billing.balance.useQuery();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your projects</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{balance.data?.credits ?? '—'} credits</span>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white"
          >
            <Plus size={18} /> New project
          </Link>
          {AUTH_DISABLED ? <span className="text-sm text-muted">demo</span> : <UserButton />}
        </div>
      </header>

      <section className="mt-8 grid gap-4">
        {projects.isLoading && <p className="text-muted">Loading…</p>}
        {projects.data?.items.length === 0 && (
          <p className="text-muted">No projects yet. Upload your first video.</p>
        )}
        {projects.data?.items.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:border-primary"
          >
            <span className="font-medium">{p.filename}</span>
            <span className="text-sm capitalize text-muted">{p.status.replace(/_/g, ' ')}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
