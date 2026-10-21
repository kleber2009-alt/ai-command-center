'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';

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
        className="btn-ghost !justify-self-start !px-3.5 !py-1.5 text-[12px]"
      >
        {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RefreshCw size={13} aria-hidden />}
        {pending ? 'retrying…' : 'retry'}
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}
