"use client";
import { Check, Download, Sparkles } from "lucide-react";
import { Button } from "./ui/button";

export type AvatarItem = {
  id: string;
  imageUrl: string;
  style: string;
  selected?: boolean;
};

export function AvatarGrid({
  avatars,
  onSelect,
  selectingId,
}: {
  avatars: AvatarItem[];
  onSelect: (id: string) => void;
  selectingId?: string | null;
}) {
  if (!avatars.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ink-900/50 p-16 text-center text-ink-500">
        <Sparkles className="mx-auto h-8 w-8 mb-3 text-accent" />
        No avatars yet. Generate your first batch.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {avatars.map((a) => (
        <article
          key={a.id}
          className={
            "group relative overflow-hidden rounded-2xl border bg-ink-900/60 transition " +
            (a.selected
              ? "border-accent shadow-glow"
              : "border-white/10 hover:border-white/30")
          }
        >
          <div className="relative aspect-[4/5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.imageUrl}
              alt={a.style}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {a.selected && (
              <div className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-ink-950 shadow-glow">
                <Check className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="p-3">
            <div className="text-sm font-medium truncate">{a.style}</div>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onSelect(a.id)}
                disabled={selectingId === a.id}
              >
                {a.selected ? "Selected" : "Select"}
              </Button>
              <a
                href={a.imageUrl}
                download
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-800 hover:bg-ink-700 border border-white/10"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
