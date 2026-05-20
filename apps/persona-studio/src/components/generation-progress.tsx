"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Status = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export function GenerationProgress({
  generationId,
  onDone,
}: {
  generationId: string;
  onDone: (avatars: { id: string; imageUrl: string; style: string }[]) => void;
}) {
  const [status, setStatus] = useState<Status>("QUEUED");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - start), 250);
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      const res = await fetch(`/api/avatars?generationId=${generationId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        avatars: { id: string; imageUrl: string; style: string }[];
        generation: { id: string; status: Status; errorMessage?: string | null } | null;
      };
      if (data.generation) {
        setStatus(data.generation.status);
        if (data.generation.status === "SUCCEEDED") {
          onDone(data.avatars);
          if (timer) clearInterval(timer);
          clearInterval(tick);
        } else if (data.generation.status === "FAILED") {
          setError(data.generation.errorMessage || "Generation failed");
          if (timer) clearInterval(timer);
          clearInterval(tick);
        }
      }
    };
    poll();
    timer = setInterval(poll, 2500);
    return () => {
      if (timer) clearInterval(timer);
      clearInterval(tick);
    };
  }, [generationId, onDone]);

  return (
    <div className="rounded-3xl border border-white/10 bg-ink-900/60 p-10 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-accent mx-auto" />
      <div className="mt-4 text-lg font-semibold">
        Generating 10 AI avatars…
      </div>
      <div className="mt-1 text-sm text-ink-500">
        Status: {status} · {Math.round(elapsed / 1000)}s
      </div>
      <div className="mt-6 grid grid-cols-5 gap-3 max-w-xl mx-auto">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/5] rounded-xl bg-ink-800 animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      {error && <div className="mt-4 text-red-400 text-sm">{error}</div>}
    </div>
  );
}
