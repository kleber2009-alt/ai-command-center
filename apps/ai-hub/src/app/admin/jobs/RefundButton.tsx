"use client";
import { useState, useTransition } from "react";

export function RefundButton({ jobId, amount }: { jobId: string; amount: number }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refund() {
    if (!confirm(`Refund ${amount} tokens for job ${jobId.slice(0, 8)}?`)) return;
    setErr(null);
    start(async () => {
      const res = await fetch(`/api/admin/jobs/${jobId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: "manual admin refund" }),
      });
      if (res.ok) { setDone(true); setTimeout(() => location.reload(), 600); }
      else { const j = await res.json().catch(() => ({})); setErr(j.error ?? "error"); }
    });
  }

  if (done) return <span className="text-xs text-green-400 font-mono">refunded</span>;
  if (err)  return <span className="text-xs text-red-400 font-mono">{err}</span>;
  return (
    <button onClick={refund} disabled={pending}
            className="text-xs px-2 py-1 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50">
      {pending ? "…" : "Refund"}
    </button>
  );
}
