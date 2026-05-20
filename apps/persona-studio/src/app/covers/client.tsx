"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import { Loader2, Download } from "lucide-react";

type Avatar = { id: string; imageUrl: string; style: string; selected: boolean };
type Cover = {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  cta: string;
  createdAt: string;
};

const SAMPLE_TITLES = [
  "I BUILT MYSELF AN AI AVATAR\nAND IT MAKES CONTENT FOR ME",
  "STOP RECORDING VIDEOS\nLET YOUR AI TWIN DO IT",
  "ONE PHOTO →\n100 POSTS PER MONTH",
];

export function CoversClient({
  avatars,
  initialAvatarId,
  existing,
}: {
  avatars: Avatar[];
  initialAvatarId: string;
  existing: Cover[];
}) {
  const [avatarId, setAvatarId] = useState(initialAvatarId);
  const [title, setTitle] = useState(SAMPLE_TITLES[0]);
  const [subtitle, setSubtitle] = useState("How I automated my content");
  const [cta, setCta] = useState("Swipe →");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [covers, setCovers] = useState<Cover[]>(existing);

  const currentAvatar = avatars.find((a) => a.id === avatarId) || avatars[0];

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId, title, subtitle, cta }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      const data = (await res.json()) as { generationId: string };
      setGenerationId(data.generationId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!generationId) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetch(`/api/generations/${generationId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        status: string;
        covers: Cover[];
        errorMessage?: string | null;
      };
      if (cancelled) return;
      if (data.status === "SUCCEEDED" && data.covers?.[0]) {
        const c = data.covers[0];
        setCovers((cur) => [
          {
            id: c.id,
            imageUrl: c.imageUrl,
            title: c.title,
            subtitle: c.subtitle,
            cta: c.cta,
            createdAt: new Date().toISOString(),
          },
          ...cur,
        ]);
        setBusy(false);
        setGenerationId(null);
      } else if (data.status === "FAILED") {
        setError(data.errorMessage || "Cover generation failed");
        setBusy(false);
        setGenerationId(null);
      }
    };
    const t = setInterval(poll, 2500);
    poll();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [generationId]);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Carousel cover
          </h1>
          <p className="mt-1 text-ink-500">
            Pick an avatar, write a hook, generate a viral Instagram cover.
          </p>
        </div>

        <Card>
          <CardTitle>Preview</CardTitle>
          <div className="mt-4 mx-auto max-w-sm aspect-[4/5] relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950">
            {currentAvatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatar.imageUrl}
                alt={currentAvatar.style}
                className="absolute inset-0 h-full w-full object-cover opacity-90"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="absolute inset-x-5 bottom-5 text-white drop-shadow">
              <div className="text-2xl font-black leading-tight whitespace-pre-line">
                {title}
              </div>
              <div className="mt-2 text-sm opacity-90">{subtitle}</div>
              <div className="mt-3 inline-flex items-center rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs">
                {cta}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-500 text-center">
            This is a CSS mock — the AI cover overlay is rendered on Generate.
          </p>
        </Card>

        <div>
          <CardTitle className="mb-4">My covers</CardTitle>
          {covers.length === 0 ? (
            <div className="text-sm text-ink-500">
              Nothing yet. Generate one →
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {covers.map((c) => (
                <a
                  key={c.id}
                  href={c.imageUrl}
                  download
                  className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-ink-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Download className="h-6 w-6 text-white" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-5">
        <Card>
          <CardTitle>Avatar</CardTitle>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {avatars.slice(0, 12).map((a) => (
              <button
                key={a.id}
                onClick={() => setAvatarId(a.id)}
                className={
                  "aspect-square rounded-lg overflow-hidden border " +
                  (a.id === avatarId
                    ? "border-accent shadow-glow"
                    : "border-white/10 hover:border-white/30")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.imageUrl}
                  alt={a.style}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Copy</CardTitle>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="title">Headline</Label>
              <Textarea
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
              />
            </div>
            <div>
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="cta">CTA</Label>
              <Input
                id="cta"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                maxLength={80}
              />
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={generate}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate cover (3 tokens)"
              )}
            </Button>
            {error && <div className="text-sm text-red-400">{error}</div>}
          </div>
        </Card>
      </aside>
    </div>
  );
}
