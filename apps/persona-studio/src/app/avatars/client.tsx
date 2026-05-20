"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarGrid, type AvatarItem } from "@/components/avatar-grid";

export function AvatarsClient({ initial }: { initial: AvatarItem[] }) {
  const router = useRouter();
  const [avatars, setAvatars] = useState(initial);
  const [selecting, setSelecting] = useState<string | null>(null);

  async function select(id: string) {
    setSelecting(id);
    const res = await fetch("/api/select-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarId: id }),
    });
    setSelecting(null);
    if (res.ok) {
      setAvatars((cur) =>
        cur.map((a) => ({ ...a, selected: a.id === id }))
      );
      router.push(`/covers?avatarId=${id}`);
    }
  }

  return (
    <AvatarGrid avatars={avatars} onSelect={select} selectingId={selecting} />
  );
}
