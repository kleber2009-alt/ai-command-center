"use client";

// Video Studio — preset-driven Kling control surface.
//
// 4 picks → 1 slug:
//   mode = image | text
//   tier = std (Kling 1.6, faster, cheaper) | pro (Kling 2.1 Master, cinematic)
//
//   image + std → image-to-video       (80⨉)
//   image + pro → image-to-video-pro   (220⨉)
//   text  + std → text-to-video        (100⨉)
//   text  + pro → text-to-video-pro    (250⨉)
//
// Camera motion + style presets are prompt prefixes that Kling reads natively.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

interface UploadedFile {
  localId: string; name: string; previewUrl: string; url: string;
}
interface MediaItem { id: string; type: string; url: string }
interface JobView { id: string; status: string; media: MediaItem[]; error_message: string | null }

const CAMERA = [
  { id: "static",     label: "Static",     emoji: "⏹",  prompt: "static camera, locked shot" },
  { id: "dolly_in",   label: "Dolly in",   emoji: "▷",  prompt: "smooth slow dolly-in toward subject" },
  { id: "dolly_out",  label: "Dolly out",  emoji: "◁",  prompt: "smooth slow dolly-out revealing scene" },
  { id: "zoom_in",    label: "Zoom in",    emoji: "+",  prompt: "slow zoom-in, tightening framing" },
  { id: "zoom_out",   label: "Zoom out",   emoji: "−",  prompt: "slow zoom-out, opening framing" },
  { id: "handheld",   label: "Handheld",   emoji: "≋",  prompt: "subtle handheld camera with organic micro-movement" },
  { id: "orbit",      label: "Orbit",      emoji: "⊙",  prompt: "slow camera orbit around subject" },
  { id: "tracking",   label: "Tracking",   emoji: "→",  prompt: "lateral tracking shot following subject motion" },
] as const;

const STYLE = [
  { id: "none",       label: "No preset",   emoji: "·",   prompt: "" },
  { id: "marvel",     label: "Marvel",      emoji: "🦸",   prompt: "cinematic Marvel-style action sequence, dramatic lighting, high contrast, hero shot" },
  { id: "dior",       label: "Dior · Lux",  emoji: "💎",   prompt: "luxury Dior-style commercial, soft cinematic light, slow motion, refined aesthetic, premium texture" },
  { id: "loro",       label: "Loro Piana",  emoji: "🤍",   prompt: "Loro Piana editorial mood, soft beige/cream palette, natural light, cashmere texture, quiet luxury" },
  { id: "cyberpunk",  label: "Cyberpunk",   emoji: "🌐",   prompt: "cyberpunk night scene, neon magenta/cyan rim light, rain reflections, blade-runner mood" },
  { id: "luxury_ad",  label: "Luxury Ad",   emoji: "✨",   prompt: "high-end luxury product commercial, polished surfaces, controlled studio lighting, premium feel" },
  { id: "documentary",label: "Documentary", emoji: "🎥",   prompt: "naturalistic documentary style, available light, handheld observational tone" },
  { id: "anime",      label: "Anime",       emoji: "🌸",   prompt: "anime film cel-shaded style, vibrant saturated colors, Studio Ghibli-inspired composition" },
  { id: "noir",       label: "Film Noir",   emoji: "🕯",   prompt: "1940s film noir, hard shadows, monochrome, smoky atmosphere, venetian-blind light" },
] as const;

const TIER_INFO: Record<"std" | "pro", { label: string; sub: string }> = {
  std: { label: "Standard · Kling 1.6", sub: "Быстрее, дешевле" },
  pro: { label: "Pro · Kling 2.1 Master", sub: "Кинематографично" },
};

const SLUG_AND_COST = {
  "image-std": { slug: "image-to-video",     cost: 80  },
  "image-pro": { slug: "image-to-video-pro", cost: 220 },
  "text-std":  { slug: "text-to-video",      cost: 100 },
  "text-pro":  { slug: "text-to-video-pro",  cost: 250 },
} as const;

export function VideoStudio() {
  const [mode,    setMode]    = useState<"image" | "text">("text");
  const [tier,    setTier]    = useState<"std" | "pro">("std");
  const [aspect,  setAspect]  = useState<"16:9" | "9:16" | "1:1">("9:16");
  const [duration,setDuration]= useState<"5" | "10">("5");
  const [camera,  setCamera]  = useState<typeof CAMERA[number]["id"]>("static");
  const [style,   setStyle]   = useState<typeof STYLE[number]["id"]>("none");
  const [prompt,  setPrompt]  = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [ref, setRef] = useState<UploadedFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);

  // ===== Slug + cost derivation =====
  const key = `${mode}-${tier}` as keyof typeof SLUG_AND_COST;
  const { slug, cost } = SLUG_AND_COST[key];

  // ===== Full prompt = style + camera + user prompt =====
  const fullPrompt = useMemo(() => {
    const camPrefix = CAMERA.find((c) => c.id === camera)?.prompt ?? "";
    const stylePrefix = STYLE.find((s) => s.id === style)?.prompt ?? "";
    const pieces = [stylePrefix, camPrefix, prompt.trim()].filter(Boolean);
    return pieces.join(". ");
  }, [camera, style, prompt]);

  // ===== Upload reference image =====
  async function uploadRef(file: File) {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    try {
      const r = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `presign HTTP ${r.status}`);
      const { putUrl, getUrl } = await r.json();
      const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`upload PUT ${putRes.status}`);
      setRef({ localId, name: file.name, previewUrl, url: getUrl });
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      URL.revokeObjectURL(previewUrl);
    }
  }
  function removeRef() {
    if (ref) URL.revokeObjectURL(ref.previewUrl);
    setRef(null);
  }

  // ===== Submit + poll =====
  async function poll(jobId: string) {
    for (let i = 0; i < 300; i++) {                              // up to 10 min
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!r.ok) continue;
      const { job: j } = await r.json();
      setJob({ id: j.id, status: j.status, media: j.media ?? [], error_message: j.error_message });
      if (j.status === "completed") return;
      if (j.status === "failed" || j.status === "refunded" || j.status === "cancelled") {
        setError(j.error_message ?? j.status); return;
      }
    }
    setError("timeout");
  }

  async function run() {
    setError(null); setJob(null); setSubmitting(true);
    try {
      if (mode === "image" && !ref) { setError("Загрузи стартовое изображение"); setSubmitting(false); return; }
      if (mode === "text"  && !prompt.trim()) { setError("Опиши сцену"); setSubmitting(false); return; }

      const input: Record<string, unknown> = {
        prompt: fullPrompt,
        duration,
      };
      if (mode === "text") {
        input.aspect_ratio = aspect;
      } else if (mode === "image" && ref) {
        input.image_url = ref.url;
        if (tier === "std") input.aspect_ratio = aspect;             // STD i2v supports ratio
      }
      if (tier === "pro" && negativePrompt.trim()) {
        input.negative_prompt = negativePrompt.trim();
      }
      if (tier === "pro" && mode === "image") {
        input.cfg_scale = 0.5;
      }

      const r = await fetch(`/api/tools/${slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error === "insufficient_funds"
          ? `Недостаточно токенов (нужно ${data.required}).`
          : data.error === "rate_limit"
          ? data.message
          : data.error ?? `HTTP ${r.status}`);
        setSubmitting(false); return;
      }
      setJob({ id: data.job.id, status: data.job.status, media: [], error_message: null });
      void poll(data.job.id).finally(() => setSubmitting(false));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  useEffect(() => () => { if (ref) URL.revokeObjectURL(ref.previewUrl); }, []); // eslint-disable-line

  return (
    <div className="max-w-[1600px] mx-auto px-6 md:px-8 py-6 md:py-8">
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Video Studio · Kling
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Кинематографичное видео из идеи.</h1>
        </div>
        <p className="text-muted text-sm mt-3 max-w-2xl leading-relaxed">
          4 пресета камеры, 8 visual-стилей, выбор Standard ⨯ Pro. Под капотом — fal.ai Kling 1.6 / 2.1 Master.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.4fr] gap-5">
        {/* ============ LEFT · Controls ============ */}
        <section className="glass overflow-hidden h-fit lg:sticky lg:top-20">
          <header className="px-6 py-4 border-b border-border">
            <h2 className="font-display text-lg font-semibold tracking-tight">Brief</h2>
          </header>
          <div className="p-6 space-y-6">

            {/* Mode (image vs text) */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <ModeButton active={mode === "text"}  onClick={() => setMode("text")}
                            title="Text → Video" sub="Генерируем с нуля" emoji="✦" />
                <ModeButton active={mode === "image"} onClick={() => setMode("image")}
                            title="Image → Video" sub="Анимируем картинку" emoji="🎞" />
              </div>
            </div>

            {/* Tier (STD vs PRO) */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Tier</label>
              <div className="grid grid-cols-2 gap-2">
                {(["std", "pro"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTier(t)}
                          className={`relative px-4 py-3 rounded-xl text-left border transition ${
                            tier === t
                              ? "bg-accent/15 border-accent text-text"
                              : "bg-white/[0.03] border-border text-muted hover:text-text"
                          }`}>
                    <div className="text-sm font-medium">{TIER_INFO[t].label}</div>
                    <div className="text-[10px] text-muted mt-0.5">{TIER_INFO[t].sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Image ref (only when image mode) */}
            {mode === "image" && (
              <div>
                <label className="text-sm font-medium block mb-1.5">Стартовая картинка <span className="text-red-400">*</span></label>
                {ref ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img src={ref.previewUrl} alt="" className="w-full max-h-48 object-cover" />
                    <button onClick={removeRef} type="button"
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white text-sm grid place-items-center">✕</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                          className="w-full py-6 rounded-xl border border-dashed border-border text-sm text-muted hover:text-accent hover:border-accent transition">
                    + Загрузить изображение
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                       onChange={(e) => {
                         if (e.target.files?.[0]) void uploadRef(e.target.files[0]);
                         e.target.value = "";
                       }} />
              </div>
            )}

            {/* Prompt */}
            <div>
              <label className="text-sm font-medium block mb-1.5">
                {mode === "text" ? "Сцена" : "Что должно произойти"} <span className="text-red-400">*</span>
              </label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                        rows={3} maxLength={500}
                        placeholder={mode === "text" ? "Italian summer beach, golden hour, woman walking toward camera" : "Subject turns head slowly, smiles, hair blowing in light wind"}
                        className="input resize-y" />
            </div>

            {/* Camera motion */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Camera motion</label>
              <div className="grid grid-cols-4 gap-2">
                {CAMERA.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCamera(c.id)}
                          title={c.prompt}
                          className={`px-2 py-2.5 rounded-lg text-xs font-medium border transition flex flex-col items-center gap-1 ${
                            camera === c.id
                              ? "bg-accent/15 border-accent text-accent"
                              : "bg-white/[0.03] border-border text-muted hover:text-text"
                          }`}>
                    <span className="text-base">{c.emoji}</span>
                    <span className="text-[10px]">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Style preset */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Style preset</label>
              <div className="grid grid-cols-3 gap-2">
                {STYLE.map((s) => (
                  <button key={s.id} type="button" onClick={() => setStyle(s.id)}
                          title={s.prompt}
                          className={`px-2 py-2.5 rounded-lg text-xs font-medium border transition flex flex-col items-center gap-0.5 ${
                            style === s.id
                              ? "bg-accent/15 border-accent text-accent"
                              : "bg-white/[0.03] border-border text-muted hover:text-text"
                          }`}>
                    <span className="text-base">{s.emoji}</span>
                    <span className="text-[10px] leading-tight">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect + duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1.5">Aspect</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["16:9", "9:16", "1:1"] as const).map((a) => (
                    <button key={a} type="button" onClick={() => setAspect(a)}
                            className={`px-2 py-2 rounded-md text-xs font-mono border transition ${
                              aspect === a ? "bg-accent/15 border-accent text-accent" : "bg-white/[0.03] border-border text-muted hover:text-text"
                            }`}>{a}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Duration</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["5", "10"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setDuration(d)}
                            className={`px-2 py-2 rounded-md text-xs font-mono border transition ${
                              duration === d ? "bg-accent/15 border-accent text-accent" : "bg-white/[0.03] border-border text-muted hover:text-text"
                            }`}>{d}s</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pro: negative prompt */}
            {tier === "pro" && (
              <div>
                <label className="text-sm font-medium block mb-1.5">Negative prompt <span className="text-muted text-xs">(Pro only)</span></label>
                <input type="text" value={negativePrompt}
                       onChange={(e) => setNegativePrompt(e.target.value)}
                       maxLength={500}
                       placeholder="blurry, low quality, text artifacts"
                       className="input" />
              </div>
            )}

            {/* Generate */}
            <div className="border-t border-border pt-5 space-y-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">Стоимость</span>
                <span className="font-mono"><span className="text-accent">✨</span> {cost} токенов</span>
              </div>
              <button onClick={run} disabled={submitting} className="btn w-full gap-2">
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                    <span>Рендерю · {job?.status ?? "queued"}</span>
                  </>
                ) : (
                  <>
                    <span>Сгенерировать видео</span><span className="text-xs opacity-70">↵</span>
                  </>
                )}
              </button>
              {error && <div className="text-red-300 text-sm">{error}</div>}
            </div>
          </div>
        </section>

        {/* ============ RIGHT · Preview ============ */}
        <section>
          <div className="glass overflow-hidden">
            <header className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display text-lg font-semibold tracking-tight">Preview</h2>
              {job && (
                <span className="text-xs text-muted font-mono">job {job.id.slice(0, 8)} · {job.status}</span>
              )}
            </header>

            <div className="p-6 space-y-4">
              {/* Full prompt preview */}
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted mb-2">Full prompt</div>
                <div className="text-sm text-text/90 leading-relaxed font-mono p-3 rounded-lg bg-white/[0.03] border border-border min-h-[3rem]">
                  {fullPrompt || <span className="text-muted">…добавь сцену и пресеты</span>}
                </div>
              </div>

              {/* Player */}
              {job?.media?.length ? (
                <video src={job.media[0].url} controls loop
                       className={`w-full h-auto rounded-xl border border-border bg-bg block ${
                         aspect === "9:16" ? "max-w-[400px] mx-auto" : ""
                       }`} />
              ) : submitting ? (
                <div className={`relative rounded-xl overflow-hidden border border-border bg-bg/40 ${
                  aspect === "9:16" ? "aspect-[9/16] max-w-[400px] mx-auto" :
                  aspect === "1:1"  ? "aspect-square" : "aspect-video"
                }`}>
                  <div className="absolute inset-0 opacity-60"
                       style={{
                         background: "conic-gradient(from 0deg, rgba(123,97,255,0.4), rgba(255,107,159,0.2), rgba(94,234,212,0.3), rgba(123,97,255,0.4))",
                         animation: "spin 4s linear infinite",
                       }} />
                  <div className="absolute inset-[2px] rounded-[10px] bg-bg/85 backdrop-blur-xl" />
                  <div className="absolute inset-0 shimmer rounded-xl opacity-50" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 rounded-full bg-accent/30 animate-ping" />
                      <div className="absolute inset-2 rounded-full bg-accent-grad shadow-glow-lg animate-pulse-ai" />
                    </div>
                    <div className="text-sm font-mono uppercase tracking-[0.2em] text-text/90">
                      {job?.status === "processing" ? "rendering" : "queued"}
                    </div>
                    <div className="text-[10px] font-mono text-muted">
                      Kling {tier === "pro" ? "2.1 Master" : "1.6"} · ~60-180 сек
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`rounded-xl bg-bg/40 border border-dashed border-border flex flex-col items-center justify-center gap-3 ${
                  aspect === "9:16" ? "aspect-[9/16] max-w-[400px] mx-auto" :
                  aspect === "1:1"  ? "aspect-square" : "aspect-video"
                }`}>
                  <div className="text-3xl opacity-40">🎬</div>
                  <div className="text-sm text-muted">Жми Сгенерировать — превью появится здесь.</div>
                </div>
              )}

              {/* Actions */}
              {job?.media?.length ? (
                <div className="flex items-center gap-3">
                  <a href={job.media[0].url} download
                     className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-accent text-white hover:opacity-90 transition"
                     title="Download">↓</a>
                  <Link href="/history" target="_blank" rel="noopener"
                        className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent/10 transition">
                    <span className="text-xs">⏱</span> View full history
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, title, sub, emoji }: {
  active: boolean; onClick: () => void; title: string; sub: string; emoji: string;
}) {
  return (
    <button type="button" onClick={onClick}
            className={`px-4 py-3 rounded-xl text-left border transition ${
              active ? "bg-accent/15 border-accent text-text" : "bg-white/[0.03] border-border text-muted hover:text-text"
            }`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="text-[10px] text-muted mt-0.5">{sub}</div>
    </button>
  );
}
