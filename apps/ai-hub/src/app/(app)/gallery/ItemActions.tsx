"use client";

import { useState, useTransition } from "react";

export function GalleryItemActions({ id, isFavorite, url }: {
  id: string; isFavorite: boolean; url: string;
}) {
  const [fav, setFav] = useState(isFavorite);
  const [pending, start] = useTransition();

  function toggleFav(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    start(async () => {
      const next = !fav;
      setFav(next);
      const r = await fetch(`/api/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
      if (!r.ok) setFav(!next);                              // revert on error
    });
  }

  return (
    <>
      <button onClick={toggleFav} disabled={pending}
              className={`w-7 h-7 rounded-md backdrop-blur-sm flex items-center justify-center text-sm transition ${
                fav ? "bg-accent text-white" : "bg-black/50 text-white/80 hover:bg-black/70"
              } disabled:opacity-50`}
              title={fav ? "В избранном" : "В избранное"}>
        {fav ? "★" : "☆"}
      </button>
      <a href={url} download onClick={(e) => e.stopPropagation()}
         className="w-7 h-7 rounded-md backdrop-blur-sm flex items-center justify-center text-sm bg-black/50 text-white/80 hover:bg-black/70 transition"
         title="Скачать">
        ↓
      </a>
    </>
  );
}
