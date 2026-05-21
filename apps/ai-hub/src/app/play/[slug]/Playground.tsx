"use client";

// Premium playground UI для featured-tools. Сейчас используется Nano Banana 2,
// но компонент дженерик — управляется input_schema из БД, поэтому пригоден
// для любого tool который попадает на маршрут /play/[slug].
//
// Слева: Input (Form/JSON tabs) с upload-зоной до 14 файлов, aspect_ratio
//        select, segmented controls для resolution и output_format,
//        Reset + Run button с количеством токенов.
// Справа: Output (Preview/JSON tabs) — превью медиа из job.media[] с
//        presigned URLs (MinIO), download и view-history.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

interface PlaygroundProps {
  slug: string;
  name: string;
  description: string;
  tokenCost: number;
  provider: string;
  model: string;
  inputSchema: Record<string, unknown>;
  initialPrompt?: string;
}

interface UploadedFile {
  localId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  url: string;                                          // presigned GET URL (24h) for provider fetch
  previewUrl: string;                                   // browser preview (object URL or same as url)
}

interface MediaItem {
  id: string;
  type: "image" | "video" | "audio" | "text";
  url: string;
  mime_type: string | null;
}

interface JobView {
  id: string;
  status: string;
  output: unknown;
  error_message: string | null;
  media: MediaItem[];
}

const MAX_FILES = 14;

export function Playground({ slug, name, description, tokenCost, provider, model, inputSchema, initialPrompt = "" }: PlaygroundProps) {
  const schema = (inputSchema ?? {}) as {
    properties?: Record<string, { type?: string; enum?: unknown[]; default?: unknown; maxItems?: number }>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  // Form state
  const [prompt, setPrompt] = useState(initialPrompt);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [aspectRatio, setAspectRatio] = useState<string>(String(props.aspect_ratio?.default ?? "Auto"));
  const [resolution, setResolution] = useState<string>(String(props.resolution?.default ?? "1K"));
  const [outputFormat, setOutputFormat] = useState<string>(String(props.output_format?.default ?? "JPG"));

  // UI mode tabs
  const [inputMode, setInputMode] = useState<"form" | "json">("form");
  const [outputMode, setOutputMode] = useState<"preview" | "json">("preview");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectOptions = (props.aspect_ratio?.enum as string[]) ?? ["Auto"];
  const resolutionOptions = (props.resolution?.enum as string[]) ?? ["1K"];
  const formatOptions = (props.output_format?.enum as string[]) ?? ["JPG"];
  const maxFiles = props.image_input?.maxItems ?? MAX_FILES;

  // Build the actual input payload sent to /api/tools/[slug]/run
  const input = useMemo(() => {
    const i: Record<string, unknown> = { prompt };
    if (files.length > 0) i.image_input = files.map((f) => f.url);
    if (aspectRatio) i.aspect_ratio = aspectRatio;
    if (resolution) i.resolution = resolution;
    if (outputFormat) i.output_format = outputFormat;
    return i;
  }, [prompt, files, aspectRatio, resolution, outputFormat]);

  function reset() {
    setPrompt("");
    setFiles([]);
    setAspectRatio(String(props.aspect_ratio?.default ?? "Auto"));
    setResolution(String(props.resolution?.default ?? "1K"));
    setOutputFormat(String(props.output_format?.default ?? "JPG"));
    setJob(null); setError(null);
  }

  async function uploadFiles(picked: File[]) {
    const slots = maxFiles - files.length;
    const accepted = picked.slice(0, slots);
    for (const f of accepted) {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(f);
      try {
        const r = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: f.name, contentType: f.type || "application/octet-stream", sizeBytes: f.size }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `presign HTTP ${r.status}`);
        }
        const { putUrl, getUrl, storageKey } = await r.json();
        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { "Content-Type": f.type || "application/octet-stream" },
          body: f,
        });
        if (!putRes.ok) throw new Error(`upload PUT ${putRes.status}`);
        setFiles((prev) => [...prev, {
          localId, name: f.name, contentType: f.type, sizeBytes: f.size,
          storageKey, url: getUrl, previewUrl,
        }]);
      } catch (err) {
        setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
        URL.revokeObjectURL(previewUrl);
      }
    }
  }

  function removeFile(localId: string) {
    setFiles((prev) => {
      const f = prev.find((x) => x.localId === localId);
      if (f) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((x) => x.localId !== localId);
    });
  }
  function removeAllFiles() {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
  }

  async function poll(jobId: string) {
    for (let i = 0; i < 240; i++) {                                     // ~8 min
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!r.ok) continue;
      const { job: j } = await r.json();
      setJob({
        id: j.id, status: j.status, output: j.output,
        error_message: j.error_message,
        media: j.media ?? [],
      });
      if (j.status === "completed") return;
      if (j.status === "failed" || j.status === "refunded" || j.status === "cancelled") {
        setError(j.error_message ?? j.status); return;
      }
    }
    setError("timeout");
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null); setJob(null);
    try {
      const res = await fetch(`/api/tools/${slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "insufficient_funds"
          ? `Недостаточно токенов (нужно ${data.required}).`
          : data.error === "rate_limit"
          ? data.message
          : data.error ?? `HTTP ${res.status}`);
        setSubmitting(false); return;
      }
      setJob({ id: data.job.id, status: data.job.status, output: null, error_message: null, media: [] });
      void poll(data.job.id).finally(() => setSubmitting(false));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  // ===== Render =====
  return (
    <div className="max-w-[1600px] mx-auto px-6 md:px-8 py-6 md:py-8">
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted mb-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(123,97,255,0.8)] mr-2 align-middle" />
          Playground · {slug}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">{name}</h1>
          <span className="text-xs font-mono uppercase tracking-wider text-muted">{provider} · {model}</span>
        </div>
        {description && <p className="text-muted text-sm mt-3 max-w-3xl leading-relaxed">{description}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ============ INPUT pane ============ */}
        <section className="glass overflow-hidden">
          <header className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-display text-lg font-semibold tracking-tight">Input</h2>
            <Tabs value={inputMode} onChange={(v) => setInputMode(v as "form" | "json")} options={[
              { value: "form", label: "Form" },
              { value: "json", label: "JSON" },
            ]} />
          </header>

          {inputMode === "form" ? (
            <form onSubmit={run} className="p-6 space-y-6">
              {/* prompt */}
              <Field name="prompt" required={required.has("prompt")} hint="A text description of the image you want to generate">
                <textarea
                  value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  required maxLength={2000} rows={5}
                  className="input resize-y"
                  placeholder="Describe what you want — e.g. «translation of all the text to Hindi»"
                />
              </Field>

              {/* image_input */}
              {props.image_input && (
                <Field name="image_input" hint={`Input images to transform or use as reference (supports up to ${maxFiles} images)`}
                       headerRight={files.length > 0 ? (
                         <button type="button" onClick={removeAllFiles}
                                 className="text-xs px-2.5 py-1 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25">
                           Remove All
                         </button>
                       ) : null}>
                  <div className="space-y-3">
                    {files.map((f, i) => (
                      <div key={f.localId} className="bg-bg/40 border border-border rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="w-8 h-8 rounded-md bg-panel border border-border flex items-center justify-center text-xs">🖼</span>
                            <span className="font-medium">File {i + 1}</span>
                          </div>
                          <button type="button" onClick={() => removeFile(f.localId)}
                                  className="text-xs px-2.5 py-1 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25">
                            Remove
                          </button>
                        </div>
                        <img src={f.previewUrl} alt={f.name} className="w-full max-h-56 object-contain rounded-lg bg-bg" />
                      </div>
                    ))}

                    {files.length < maxFiles && (
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                              className="w-full border border-dashed border-border rounded-xl py-3 text-sm text-muted hover:border-accent hover:text-accent transition">
                        + Add more files ({files.length}/{maxFiles})
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                           onChange={(e) => {
                             if (e.target.files) void uploadFiles(Array.from(e.target.files));
                             e.target.value = "";
                           }} />
                  </div>
                </Field>
              )}

              {/* aspect_ratio */}
              {props.aspect_ratio && (
                <Field name="aspect_ratio" hint="Aspect ratio of the generated image">
                  <select className="input" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                    {aspectOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </Field>
              )}

              {/* resolution */}
              {props.resolution && (
                <Field name="resolution" hint="Resolution of the generated image. Higher resolutions take longer to generate.">
                  <Segmented value={resolution} onChange={setResolution} options={resolutionOptions} />
                </Field>
              )}

              {/* output_format */}
              {props.output_format && (
                <Field name="output_format" hint="Format of the output image">
                  <Segmented value={outputFormat} onChange={setOutputFormat} options={formatOptions} />
                </Field>
              )}

              {/* Actions */}
              <div className="border-t border-border pt-5 flex items-center justify-end gap-3">
                <button type="button" onClick={reset} className="btn-ghost">Reset</button>
                <button type="submit" disabled={submitting || !prompt} className="btn flex items-center gap-2">
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                      Running…
                    </span>
                  ) : (
                    <>
                      <span className="text-xs">✨</span>
                      <span className="font-mono text-xs opacity-80">{tokenCost}</span>
                      <span>Run</span>
                    </>
                  )}
                </button>
              </div>

              {error && <div className="text-red-400 text-sm">{error}</div>}
            </form>
          ) : (
            <pre className="p-6 text-xs overflow-auto max-h-[700px] bg-bg/40 text-muted">
              {JSON.stringify(input, null, 2)}
            </pre>
          )}
        </section>

        {/* ============ OUTPUT pane ============ */}
        <section className="glass overflow-hidden">
          <header className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-display text-lg font-semibold tracking-tight">Output</h2>
            <Tabs value={outputMode} onChange={(v) => setOutputMode(v as "preview" | "json")} options={[
              { value: "preview", label: "Preview" },
              { value: "json", label: "JSON" },
            ]} />
          </header>

          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">output type</span>
              <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-accent/20 text-accent">image</span>
              {job && (
                <span className="ml-auto text-xs text-muted font-mono">
                  job {job.id.slice(0, 8)} · {job.status}
                </span>
              )}
            </div>

            {outputMode === "preview" ? (
              <>
                {job?.media?.length ? (
                  <div className="space-y-3">
                    {job.media.map((m) => (
                      <a key={m.id} href={m.url} target="_blank" rel="noreferrer"
                         className="block rounded-xl overflow-hidden border border-border bg-bg/40">
                        {m.type === "image" && <img src={m.url} alt="" className="w-full h-auto block" />}
                        {m.type === "video" && <video src={m.url} controls className="w-full h-auto block" />}
                        {m.type === "audio" && <audio src={m.url} controls className="w-full p-3" />}
                      </a>
                    ))}
                  </div>
                ) : submitting ? (
                  <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-bg/40">
                    {/* flowing accent gradient — "AI thinking" */}
                    <div className="absolute inset-0 opacity-60"
                         style={{
                           background: "conic-gradient(from 0deg, rgba(123,97,255,0.4), rgba(255,107,159,0.2), rgba(94,234,212,0.3), rgba(123,97,255,0.4))",
                           animation: "spin 4s linear infinite",
                         }} />
                    <div className="absolute inset-[2px] rounded-[10px] bg-bg/85 backdrop-blur-xl" />
                    {/* shimmer band */}
                    <div className="absolute inset-0 shimmer rounded-xl opacity-50" />
                    {/* pulse dot + status */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="relative w-12 h-12">
                        <div className="absolute inset-0 rounded-full bg-accent/30 animate-ping" />
                        <div className="absolute inset-2 rounded-full bg-accent-grad shadow-glow-lg animate-pulse-ai" />
                      </div>
                      <div className="text-sm font-mono uppercase tracking-[0.2em] text-text/90">
                        {job?.status === "processing" ? "generating" : "queued"}
                      </div>
                      <div className="text-[10px] font-mono text-muted">
                        ~30s · provider {provider}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video rounded-xl bg-bg/40 border border-dashed border-border flex flex-col items-center justify-center gap-3">
                    <div className="text-3xl opacity-40">✨</div>
                    <div className="text-sm text-muted">Запусти инструмент — результат появится здесь.</div>
                  </div>
                )}

                {job?.media?.length ? (
                  <div className="flex items-center gap-3 pt-2">
                    <a href={job.media[0].url} download
                       className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-accent text-white hover:opacity-90 transition"
                       title="Download">
                      ↓
                    </a>
                    <Link href="/history" target="_blank" rel="noopener"
                          className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent/10 transition">
                      <span className="text-xs">⏱</span> View full history
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <pre className="p-4 text-xs overflow-auto max-h-[600px] bg-bg/40 text-muted rounded-xl">
                {job ? JSON.stringify(job, null, 2) : "// run the tool to see raw output"}
              </pre>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ====== UI bits ======

function Tabs({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex items-center bg-bg/60 border border-border rounded-lg p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  value === o.value ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="inline-flex items-center gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  value === o
                    ? "bg-accent/15 border-accent text-accent"
                    : "bg-panel border-border text-muted hover:text-text hover:border-border/80"
                }`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ name, required, hint, headerRight, children }: {
  name: string; required?: boolean; hint?: string;
  headerRight?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text">
          {name}{required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {headerRight}
      </div>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
