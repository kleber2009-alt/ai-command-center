"use client";

import { useState, useTransition } from "react";

export function FeatureToggle({ id, initial }: { id: string; initial: boolean }) {
  const [featured, setFeatured] = useState(initial);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !featured;
    setFeatured(next);                                    // optimistic
    start(async () => {
      const r = await fetch(`/api/admin/media/${id}/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: next }),
      });
      if (!r.ok) setFeatured(!next);                      // revert on error
    });
  }

  return (
    <button onClick={toggle} disabled={pending} type="button"
            className={`w-8 h-8 rounded-md backdrop-blur-sm flex items-center justify-center text-sm transition ${
              featured ? "bg-accent text-white shadow-glow" : "bg-black/60 text-white/70 hover:bg-black/80"
            } disabled:opacity-50`}
            title={featured ? "Снять со Showcase" : "Добавить в Showcase"}>
      {featured ? "★" : "☆"}
    </button>
  );
}
