"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadZone } from "@/components/upload-zone";
import { GenerationProgress } from "@/components/generation-progress";
import { AvatarGrid, type AvatarItem } from "@/components/avatar-grid";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

type UploadResult = { id: string; url: string; mimeType: string; bytes: number };

export default function GeneratePage() {
  const router = useRouter();
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!upload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: upload.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      const data = (await res.json()) as { generationId: string };
      setGenerationId(data.generationId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function select(avatarId: string) {
    setSelecting(avatarId);
    try {
      const res = await fetch("/api/select-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId }),
      });
      if (!res.ok) throw new Error("Select failed");
      router.push(`/covers?avatarId=${avatarId}`);
    } catch (e) {
      setError((e as Error).message);
      setSelecting(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Create your AI avatars
          </h1>
          <p className="mt-1 text-ink-500">
            Step 1 — upload one clear front-facing photo.
          </p>
        </div>
      </div>

      {!generationId && (
        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          <UploadZone onUploaded={setUpload} />
          <Card>
            <CardTitle>Ready to generate</CardTitle>
            <p className="mt-2 text-sm text-ink-500">
              10 cinematic styles will be rendered from your photo. Costs 10
              tokens.
            </p>
            <Button
              size="lg"
              className="mt-5 w-full"
              disabled={!upload || busy}
              onClick={start}
            >
              {busy ? "Starting…" : "Generate 10 Avatars"}
            </Button>
            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
            <div className="mt-6 border-t border-white/10 pt-4 text-xs text-ink-500 space-y-1">
              <div>• 1 face per photo</div>
              <div>• JPG / PNG / WEBP, max 20 MB</div>
              <div>• Minimum 512×512</div>
            </div>
          </Card>
        </div>
      )}

      {generationId && !avatars.length && (
        <GenerationProgress
          generationId={generationId}
          onDone={(a) => setAvatars(a)}
        />
      )}

      {avatars.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pick your avatar</h2>
          <AvatarGrid
            avatars={avatars}
            onSelect={select}
            selectingId={selecting}
          />
        </div>
      )}
    </div>
  );
}
