'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RetryCoverButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setErr(null);
    try {
      const res = await fetch(`/api/covers/${id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="mono text-[9px] tracking-widest uppercase text-lime hover:underline disabled:opacity-50 text-left"
      >
        {pending ? 'retrying…' : 'retry →'}
      </button>
      {err && <span className="mono text-[9px] text-pink">{err}</span>}
    </div>
  );
}
