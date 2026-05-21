"use client";
import { useState, useTransition } from "react";

export function ToolControls({ toolId, status, cost }: {
  toolId: string; status: string; cost: number;
}) {
  const [pending, start] = useTransition();
  const [costInput, setCostInput] = useState(String(cost));

  async function patch(body: Record<string, unknown>) {
    start(async () => {
      const res = await fetch(`/api/admin/tools/${toolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) location.reload();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status} disabled={pending}
        onChange={(e) => patch({ status: e.target.value })}
        className="bg-bg border border-border rounded-md px-2 py-1 text-xs"
      >
        <option value="active">active</option>
        <option value="beta">beta</option>
        <option value="disabled">disabled</option>
      </select>
      <input
        type="number" value={costInput} disabled={pending}
        onChange={(e) => setCostInput(e.target.value)}
        onBlur={() => {
          const n = Number(costInput);
          if (Number.isFinite(n) && n > 0 && n !== cost) patch({ tokenCost: n });
        }}
        className="w-20 bg-bg border border-border rounded-md px-2 py-1 text-xs font-mono"
      />
    </div>
  );
}
