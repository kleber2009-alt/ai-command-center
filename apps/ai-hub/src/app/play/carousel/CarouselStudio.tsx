"use client";

// Carousel Studio — Instagram-style multi-slide generator.
//
// Flow:
//   1. User uploads up to 14 references (re-uses /api/uploads/presign).
//   2. Picks slide count (3 / 5 / 7 / 10), aspect ratio, brand prompt.
//   3. "Generate carousel" → fires N POST /api/tools/carousel/run sequentially,
//      tracking job state per slide.
//   4. Each slide polls /api/jobs/:id until completed (or fails).
//   5. After all slides resolved: drag-reorder, regenerate single slide,
//      download all as separate PNG/JPG downloads.

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  tokenCost: number;                                     // tokens per slide
  provider: string;
  model: string;
}

interface UploadedRef {
  localId: string;
  name: string;
  previewUrl: string;                                    // object URL for browser preview
  url: string;                                           // signed GET URL for provider
}

type SlideStatus = "idle" | "queued" | "processing" | "completed" | "failed";

interface Slide {
  index: number;                                         // visual order (1-based)
  jobId: string | null;
  status: SlideStatus;
  mediaUrl: string | null;
  error: string | null;
}

const SLIDE_COUNTS = [3, 5, 7, 10] as const;
const ASPECTS = ["1:1", "4:5", "9:16"] as const;
const MAX_REFS = 14;

export function CarouselStudio({ tokenCost, provider, model }: Props) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState<typeof SLIDE_COUNTS[number]>(5);
  const [aspect, setAspect] = useState<typeof ASPECTS[number]>("1:1");
  const [refs, setRefs] = useState<UploadedRef[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag-reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const totalCost = tokenCost * count;
  const completedCount = slides.filter((s) => s.status === "completed").length;

  // ===== Refs upload =====
  async function uploadRefs(picked: File[]) {
    const slots = MAX_REFS - refs.length;
    for (const f of picked.slice(0, slots)) {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(f);
      try {
        const r = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: f.name, contentType: f.type || "application/octet-stream", sizeBytes: f.size }),
        });
        if (!r.ok) throw new Error((await r.json()).error ?? `presign HTTP ${r.status}`);
        const { putUrl, getUrl } = await r.json();
        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { "Content-Type": f.type || "application/octet-stream" },
          body: f,
        });
        if (!putRes.ok) throw new Error(`upload PUT ${putRes.status}`);
        setRefs((prev) => [...prev, { localId, name: f.name, previewUrl, url: getUrl }]);
      } catch (err) {
        setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
        URL.revokeObjectURL(previewUrl);
      }
    }
  }
  function removeRef(localId: string) {
    setRefs((prev) => {
      const r = prev.find((x) => x.localId === localId);
      if (r) URL.revokeObjectURL(r.previewUrl);
      return prev.filter((x) => x.localId !== localId);
    });
  }

  // ===== Single-slide submit + poll =====
  async function submitSlide(slideIndex: number, n: number): Promise<{ jobId: string }> {
    const slidePrompt = `${prompt.trim()}\n\nSlide ${slideIndex} of ${n}.`;
    const input: Record<string, unknown> = {
      prompt: slidePrompt,
      aspect_ratio: aspect,
      resolution: "1K",
      output_format: "PNG",
    };
    if (refs.length > 0) input.image_input = refs.map((r) => r.url);

    const r = await fetch("/api/tools/carousel/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data.error === "insufficient_funds"
        ? `Недостаточно токенов (нужно ${data.required}).`
        : data.error === "rate_limit" ? data.message : data.error ?? `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return { jobId: data.job.id };
  }

  async function pollSlide(jobId: string, idx: number) {
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!r.ok) continue;
      const { job } = await r.json();
      setSlides((prev) => prev.map((s) => s.index !== idx ? s : {
        ...s, status: job.status, jobId,
        mediaUrl: job.media?.[0]?.url ?? null,
        error: job.status === "failed" || job.status === "refunded" ? (job.error_message ?? job.status) : null,
      }));
      if (job.status === "completed" || job.status === "failed" || job.status === "refunded" || job.status === "cancelled") return;
    }
    setSlides((prev) => prev.map((s) => s.index !== idx ? s : { ...s, status: "failed", error: "timeout" }));
  }

  // ===== Generate carousel =====
  async function generate() {
    if (!prompt.trim()) { setError("Опиши тему карусели"); return; }
    setError(null);
    setRunning(true);

    const fresh: Slide[] = Array.from({ length: count }, (_, i) => ({
      index: i + 1, jobId: null, status: "queued", mediaUrl: null, error: null,
    }));
    setSlides(fresh);

    // Fire slides sequentially to keep job-creation rate-limit happy.
    // Polling runs in parallel after each is queued.
    const pollers: Promise<void>[] = [];
    try {
      for (let i = 1; i <= count; i++) {
        try {
          const { jobId } = await submitSlide(i, count);
          setSlides((prev) => prev.map((s) => s.index !== i ? s : { ...s, jobId, status: "processing" }));
          pollers.push(pollSlide(jobId, i));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setSlides((prev) => prev.map((s) => s.index !== i ? s : { ...s, status: "failed", error: msg }));
          if (msg.includes("Недостаточно")) {
            setError(msg);
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 300));    // gentle stagger
      }
      await Promise.all(pollers);
    } finally {
      setRunning(false);
    }
  }

  // ===== Regenerate single slide =====
  async function regenSlide(idx: number) {
    setSlides((prev) => prev.map((s) => s.index !== idx ? s : { ...s, status: "queued", mediaUrl: null, error: null, jobId: null }));
    try {
      const { jobId } = await submitSlide(idx, count);
      setSlides((prev) => prev.map((s) => s.index !== idx ? s : { ...s, jobId, status: "processing" }));
      await pollSlide(jobId, idx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSlides((prev) => prev.map((s) => s.index !== idx ? s : { ...s, status: "failed", error: msg }));
    }
  }

  // ===== Reset =====
  function reset() {
    refs.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    setRefs([]); setSlides([]); setError(null); setPrompt("");
  }

  // ===== Drag reorder =====
  function onDragStart(idx: number) { setDragIdx(idx); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    setSlides((prev) => {
      const fromI = prev.findIndex((s) => s.index === dragIdx);
      const toI   = prev.findIndex((s) => s.index === targetIdx);
      if (fromI < 0 || toI < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromI, 1);
      next.splice(toI, 0, moved);
      return next.map((s, i) => ({ ...s, index: i + 1 }));
    });
    setDragIdx(null);
  }

  // ===== Download all (separate PNG/JPG files) =====
  async function downloadAll() {
    const done = slides.filter((s) => s.mediaUrl);
    if (!done.length) return;
    for (const s of done) {
      try {
        const r = await fetch(s.mediaUrl!);
        const blob = await r.blob();
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `slide-${String(s.index).padStart(2, "0")}.${ext}`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 250));    // browsers throttle batched downloads
      } catch { /* skip */ }
    }
  }

  // ===== Export PDF (single multi-page file, lazy-loads jspdf) =====
  const [exporting, setExporting] = useState(false);
  async function exportPdf() {
    const done = slides.filter((s) => s.mediaUrl);
    if (!done.length) return;
    setExporting(true);
    try {
      // Lazy-load jspdf so the ~50KB bundle isn't pulled until export is clicked.
      const { jsPDF } = await import("jspdf");

      // Page size matches the chosen aspect ratio.
      const ratio = aspect === "1:1" ? [1080, 1080] : aspect === "4:5" ? [1080, 1350] : [1080, 1920];
      const [pw, ph] = ratio;
      const pdf = new jsPDF({ unit: "px", format: [pw, ph], orientation: ph > pw ? "portrait" : "landscape" });

      for (let i = 0; i < done.length; i++) {
        const s = done[i];
        // Pull image as dataURL via canvas so jsPDF can embed it regardless of MIME.
        const dataUrl = await imageToDataUrl(s.mediaUrl!, pw, ph);
        if (i > 0) pdf.addPage([pw, ph], ph > pw ? "portrait" : "landscape");
        pdf.addImage(dataUrl, "JPEG", 0, 0, pw, ph, undefined, "FAST");
      }

      pdf.save(`carousel-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setError(`PDF export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  async function imageToDataUrl(url: string, targetW: number, targetH: number): Promise<string> {
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext("2d")!;
    // cover-fit the image into target box
    const scale = Math.max(targetW / bitmap.width, targetH / bitmap.height);
    const dw = bitmap.width * scale, dh = bitmap.height * scale;
    const dx = (targetW - dw) / 2, dy = (targetH - dh) / 2;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(bitmap, dx, dy, dw, dh);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  // ===== Cleanup object URLs =====
  useEffect(() => () => { refs.forEach((r) => URL.revokeObjectURL(r.previewUrl)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-[1600px] mx-auto px-6 md:px-8 py-6 md:py-8">
      {/* ===== Header ===== */}
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Carousel Studio · {provider} · {model}
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          Карусель за один заход.
        </h1>
        <p className="text-muted text-sm mt-3 max-w-2xl leading-relaxed">
          Опиши тему, добавь референсы стиля — получишь {count} согласованных слайдов одной серией.
          Можно перетаскивать порядок, перегенерировать отдельный слайд, скачать пачкой.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,2fr] gap-5">
        {/* ============ LEFT · Brief ============ */}
        <section className="glass overflow-hidden h-fit lg:sticky lg:top-20">
          <header className="px-6 py-4 border-b border-border">
            <h2 className="font-display text-lg font-semibold tracking-tight">Brief</h2>
          </header>

          <div className="p-6 space-y-5">
            {/* Prompt */}
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Тема <span className="text-red-400">*</span>
              </label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                        rows={4} maxLength={1500}
                        placeholder="Italian summer outfits, luxury Loro Piana aesthetic, soft beige + cream palette, cinematic light, no text"
                        className="input resize-y" />
              <p className="text-xs text-muted mt-1.5">Один общий бриф — авто-расширится под каждый слайд.</p>
            </div>

            {/* Slide count */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Слайдов</label>
              <div className="grid grid-cols-4 gap-2">
                {SLIDE_COUNTS.map((n) => (
                  <button key={n} type="button" onClick={() => setCount(n)}
                          className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                            count === n
                              ? "bg-accent/15 border-accent text-accent"
                              : "bg-white/[0.03] border-border text-muted hover:text-text"
                          }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect ratio */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Соотношение</label>
              <div className="grid grid-cols-3 gap-2">
                {ASPECTS.map((a) => (
                  <button key={a} type="button" onClick={() => setAspect(a)}
                          className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                            aspect === a
                              ? "bg-accent/15 border-accent text-accent"
                              : "bg-white/[0.03] border-border text-muted hover:text-text"
                          }`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* References */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">Референсы стиля</label>
                {refs.length > 0 && (
                  <span className="text-xs text-muted font-mono">{refs.length}/{MAX_REFS}</span>
                )}
              </div>
              {refs.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {refs.map((r) => (
                    <div key={r.localId} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                      <img src={r.previewUrl} alt={r.name} className="w-full h-full object-cover" />
                      <button onClick={() => removeRef(r.localId)} type="button"
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs grid place-items-center opacity-0 group-hover:opacity-100 transition">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {refs.length < MAX_REFS && (
                <button type="button" onClick={() => fileRef.current?.click()}
                        className="w-full py-3 rounded-lg border border-dashed border-border text-sm text-muted hover:text-accent hover:border-accent transition">
                  + Добавить картинку ({refs.length}/{MAX_REFS})
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                     onChange={(e) => {
                       if (e.target.files) void uploadRefs(Array.from(e.target.files));
                       e.target.value = "";
                     }} />
            </div>

            {/* Generate */}
            <div className="border-t border-border pt-5 space-y-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">Стоимость</span>
                <span className="font-mono"><span className="text-accent">✨</span> {totalCost} ток. ({tokenCost} × {count})</span>
              </div>
              <button onClick={generate} disabled={running || !prompt.trim()}
                      className="btn w-full gap-2">
                {running ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                    <span>Generating · {completedCount}/{count}</span>
                  </>
                ) : (
                  <>
                    <span>Сгенерировать карусель</span>
                    <span className="text-xs opacity-70">↵</span>
                  </>
                )}
              </button>
              {slides.length > 0 && (
                <button onClick={reset} type="button" className="btn-ghost w-full text-sm">
                  Сбросить
                </button>
              )}
              {error && <div className="text-red-400 text-sm">{error}</div>}
            </div>
          </div>
        </section>

        {/* ============ RIGHT · Slides ============ */}
        <section>
          {slides.length === 0 ? (
            <div className="glass p-16 text-center">
              <div className="text-5xl opacity-40 mb-4">🎞</div>
              <div className="font-display text-xl font-semibold tracking-tight mb-1">
                Carousel canvas awaits.
              </div>
              <p className="text-muted text-sm max-w-md mx-auto">
                Опиши тему слева — каждый слайд появится здесь сразу как будет готов.
                После генерации можно тащить их в нужный порядок и перегенерировать отдельные.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Slides · {completedCount}/{slides.length}
                  </h2>
                  <p className="text-xs text-muted mt-0.5">Перетащи чтобы сменить порядок · клик на слайд — перегенерировать.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={exportPdf} disabled={completedCount === 0 || exporting}
                          className="btn-ghost text-sm gap-1.5 disabled:opacity-40">
                    {exporting ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                    ) : <span>📄</span>}
                    <span>PDF</span>
                  </button>
                  <button onClick={downloadAll} disabled={completedCount === 0}
                          className="btn-ghost text-sm gap-1.5 disabled:opacity-40">
                    <span>↓</span>
                    <span>PNG-пак ({completedCount})</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {slides.map((s) => (
                  <SlideCard key={s.index} slide={s} aspect={aspect}
                             onDragStart={() => onDragStart(s.index)}
                             onDragOver={onDragOver}
                             onDrop={() => onDrop(s.index)}
                             onRegen={() => regenSlide(s.index)}
                             dragging={dragIdx === s.index} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SlideCard({ slide, aspect, dragging, onDragStart, onDragOver, onDrop, onRegen }: {
  slide: Slide; aspect: string; dragging: boolean;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void; onRegen: () => void;
}) {
  const aspectClass = aspect === "1:1" ? "aspect-square" : aspect === "4:5" ? "aspect-[4/5]" : "aspect-[9/16]";
  const inFlight = slide.status === "queued" || slide.status === "processing";

  return (
    <div draggable={slide.status === "completed"}
         onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
         className={`group relative glass overflow-hidden transition ${
           dragging ? "opacity-40" : ""
         } ${slide.status === "completed" ? "cursor-grab active:cursor-grabbing" : ""}`}>
      {/* Slide number */}
      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-white text-xs font-mono">
        {slide.index}
      </div>

      <div className={`relative ${aspectClass} bg-bg/40 overflow-hidden`}>
        {slide.mediaUrl ? (
          <img src={slide.mediaUrl} alt={`Slide ${slide.index}`} className="w-full h-full object-cover" />
        ) : inFlight ? (
          <>
            <div className="absolute inset-0 opacity-60"
                 style={{
                   background: "conic-gradient(from 0deg, rgba(123,97,255,0.4), rgba(255,107,159,0.2), rgba(94,234,212,0.3), rgba(123,97,255,0.4))",
                   animation: "spin 4s linear infinite",
                 }} />
            <div className="absolute inset-[2px] bg-bg/85 backdrop-blur-xl" />
            <div className="absolute inset-0 shimmer opacity-50" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full bg-accent/30 animate-ping" />
                <div className="absolute inset-1 rounded-full bg-accent-grad animate-pulse-ai" />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text/80">
                {slide.status === "queued" ? "queued" : "generating"}
              </div>
            </div>
          </>
        ) : slide.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-3">
            <div className="text-2xl opacity-50">✕</div>
            <div className="text-[10px] font-mono text-red-300/80 line-clamp-2">{slide.error}</div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted/40 text-2xl">·</div>
        )}

        {/* Hover actions */}
        {(slide.status === "completed" || slide.status === "failed") && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none">
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
              <button onClick={onRegen} type="button"
                      className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs hover:bg-accent/80 transition">
                ↻ regen
              </button>
              {slide.mediaUrl && (
                <a href={slide.mediaUrl} download={`slide-${String(slide.index).padStart(2, "0")}.png`}
                   onClick={(e) => e.stopPropagation()}
                   className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs hover:bg-accent/80 transition">
                  ↓
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
