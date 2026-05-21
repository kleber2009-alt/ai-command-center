"use client";
// Generic runner: reads the tool's JSON schema and renders inputs, submits
// to /api/tools/:slug/run, polls /api/jobs/:id, renders any media that the
// provider produced (downloaded and re-served from our MinIO via presigned URLs).

import { useState } from "react";

type Schema = {
  properties?: Record<string, {
    type?: string; enum?: unknown[]; default?: unknown;
    minLength?: number; maxLength?: number; format?: string;
  }>;
  required?: string[];
};

type MediaItem = { id: string; type: "image" | "video" | "audio" | "text"; url: string; mime_type: string | null };

export function ToolRunner({ slug, schema }: { slug: string; schema: Record<string, unknown> }) {
  const s = (schema ?? {}) as Schema;
  const fields = Object.entries(s.properties ?? {});
  const required = new Set(s.required ?? []);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const [k, def] of fields) if (def.default !== undefined) init[k] = def.default;
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [jobOutput, setJobOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function poll(id: string) {
    for (let i = 0; i < 180; i++) {                              // up to ~6 min
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!r.ok) continue;
      const { job } = await r.json();
      setJobStatus(job.status);
      if (job.media?.length) setMedia(job.media);

      if (job.status === "completed") { setJobOutput(job.output); return; }
      if (job.status === "failed" || job.status === "refunded" || job.status === "cancelled") {
        setError(job.error_message ?? job.status); return;
      }
    }
    setError("timeout");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null); setMedia([]); setJobOutput(null); setJobStatus(null);
    try {
      const res = await fetch(`/api/tools/${slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: values }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "insufficient_funds"
          ? `Недостаточно токенов (нужно ${data.required}).`
          : data.error ?? `HTTP ${res.status}`);
        setSubmitting(false); return;
      }
      setJobId(data.job.id); setJobStatus(data.job.status);
      void poll(data.job.id).finally(() => setSubmitting(false));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="panel p-6 space-y-4">
        {fields.map(([name, def]) => (
          <div key={name}>
            <label className="block text-sm text-muted mb-1.5">
              {name}{required.has(name) && <span className="text-accent ml-1">*</span>}
            </label>
            {def.enum ? (
              <select className="input" value={String(values[name] ?? "")}
                      onChange={(e) => setValues({ ...values, [name]: castEnum(def, e.target.value) })}>
                <option value="">—</option>
                {(def.enum as unknown[]).map((v) => (
                  <option key={String(v)} value={String(v)}>{String(v)}</option>
                ))}
              </select>
            ) : def.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(values[name])}
                       onChange={(e) => setValues({ ...values, [name]: e.target.checked })}/>
                <span className="text-muted">{name}</span>
              </label>
            ) : def.type === "integer" || def.type === "number" ? (
              <input className="input" type="number"
                     value={values[name] !== undefined ? String(values[name]) : ""}
                     onChange={(e) => setValues({ ...values, [name]: e.target.value === "" ? undefined : Number(e.target.value) })}/>
            ) : (
              <input className="input" type={def.format === "uri" ? "url" : "text"}
                     required={required.has(name)}
                     maxLength={def.maxLength} minLength={def.minLength}
                     placeholder={def.format === "uri" ? "https://…" : undefined}
                     value={String(values[name] ?? "")}
                     onChange={(e) => setValues({ ...values, [name]: e.target.value })}/>
            )}
          </div>
        ))}
        <button className="btn" disabled={submitting}>
          {submitting ? "Работаю…" : "Запустить"}
        </button>
        {error && <div className="text-red-400 text-sm">{error}</div>}
      </form>

      {jobId && (
        <div className="panel p-6 space-y-4">
          <div className="text-sm text-muted">
            Job <span className="font-mono">{jobId.slice(0, 8)}</span> · {jobStatus ?? "…"}
          </div>

          {media.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {media.map((m) => (
                <a key={m.id} href={m.url} target="_blank" rel="noreferrer"
                   className="block rounded-xl overflow-hidden border border-border bg-bg">
                  {m.type === "image" && (
                    <img src={m.url} alt="" className="w-full h-auto block" />
                  )}
                  {m.type === "video" && (
                    <video src={m.url} controls className="w-full h-auto block" />
                  )}
                  {m.type === "audio" && (
                    <audio src={m.url} controls className="w-full p-3" />
                  )}
                </a>
              ))}
            </div>
          )}

          {jobStatus === "completed" && media.length === 0 && jobOutput !== null && (
            <pre className="text-xs overflow-auto max-h-96 bg-bg p-3 rounded-xl">
              {JSON.stringify(jobOutput, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function castEnum(def: { type?: string }, v: string): unknown {
  if (v === "") return undefined;
  if (def.type === "integer" || def.type === "number") return Number(v);
  return v;
}
