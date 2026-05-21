"use client";
import { useState, useTransition } from "react";

export function GrantTokens({ userId }: { userId: string }) {
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function grant() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) return;
    setMsg(null);
    start(async () => {
      const res = await fetch(`/api/admin/users/${userId}/grant-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: n, reason: "manual admin grant" }),
      });
      if (res.ok) {
        setAmount(""); setMsg(`+${n}`);
        setTimeout(() => location.reload(), 600);
      } else {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error ?? "error");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
        placeholder="±tokens"
        className="w-24 bg-bg border border-border rounded-md px-2 py-1 text-xs font-mono"
      />
      <button onClick={grant} disabled={pending || !amount}
              className="text-xs px-2 py-1 rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50">
        {pending ? "…" : "Grant"}
      </button>
      {msg && <span className="text-xs text-green-400 font-mono">{msg}</span>}
    </div>
  );
}
