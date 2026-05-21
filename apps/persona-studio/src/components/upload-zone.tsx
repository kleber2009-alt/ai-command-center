"use client";
import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { ImagePlus, Loader2 } from "lucide-react";

type UploadResult = {
  id: string;
  url: string;
  mimeType: string;
  bytes: number;
};

export function UploadZone({
  onUploaded,
}: {
  onUploaded: (u: UploadResult) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as UploadResult;
      onUploaded(data);
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className="relative flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-ink-900/60 hover:border-accent transition-colors cursor-pointer aspect-[4/5] overflow-hidden"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="preview"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <ImagePlus className="h-10 w-10 text-accent" />
            <div className="text-base font-semibold">
              Drop a photo or click to upload
            </div>
            <div className="text-sm text-ink-500">
              JPG / PNG / WEBP · 1 face · ≥ 512×512 · max 20 MB
            </div>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-ink-950/70 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {error && (
        <div className="mt-3 text-sm text-red-400">{error}</div>
      )}
      {preview && !busy && (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => {
            setPreview(null);
            if (ref.current) ref.current.value = "";
          }}
        >
          Replace photo
        </Button>
      )}
    </div>
  );
}
