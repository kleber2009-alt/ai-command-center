// kie.ai client — Nano Banana 2 (Google Gemini 2.5/3.1 Flash Image) через playground API.
//
// Известная схема (validated через ai-hub kie adapter, prod 2026-05):
//
//   POST https://api.kie.ai/api/v1/playground/createTask
//        Authorization: Bearer <KIE_API_KEY>
//        body: { model: "nano-banana-2", input: {...}, callBackUrl?: string }
//        → { code: 200, msg: "success", data: { taskId, recordId } }
//
//   GET  https://api.kie.ai/api/v1/playground/recordInfo?taskId=<id>
//        Authorization: Bearer <KIE_API_KEY>
//        → { code: 200, data: { state, resultJson, failMsg, ... } }
//
//   state: "waiting" | "processing" | "success" | "failed"
//   resultJson: JSON-string с { resultUrls: [...] } (массив URL'ов сгенерированных картинок)
//
// Quirk: kie case-sensitive на enum values input'а.
//   aspect_ratio: lowercase ("auto","1:1","16:9","9:16","4:3","3:4")
//   output_format: lowercase ("jpg","png")
//   resolution:   uppercase ("1K","2K","4K")

const KIE_BASE = process.env.KIE_BASE_URL ?? 'https://api.kie.ai/api/v1';
const KIE_MODEL = process.env.KIE_IMAGE_MODEL ?? 'nano-banana-2';

const SUBMIT_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 100;  // ~5 минут на одну задачу

export class KieError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'KieError';
  }
}

function keyOrThrow(): string {
  const k = process.env.KIE_API_KEY;
  if (!k) throw new KieError('MISSING_KEY', 'KIE_API_KEY is not set');
  return k;
}

export type KieAspect = 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
export type KieResolution = '1K' | '2K' | '4K';
export type KieFormat = 'jpg' | 'png';

export type KieImageInput = string;  // public URL or data URI

export type KieSubmitOpts = {
  prompt: string;
  imageInput?: KieImageInput[];
  aspectRatio?: KieAspect;
  resolution?: KieResolution;
  outputFormat?: KieFormat;
  model?: string;
  callBackUrl?: string;
};

type KieCreateResp = {
  code: number;
  msg?: string;
  data?: { taskId: string; recordId?: string };
};

type KieState = 'waiting' | 'processing' | 'success' | 'failed';

type KieRecordResp = {
  code: number;
  data?: {
    taskId: string;
    model: string;
    state: KieState;
    resultJson?: string;
    failCode?: string | null;
    failMsg?: string | null;
    creditsConsumed?: number;
  };
};

/** Submit a generation task. Returns the kie taskId. */
export async function submitTask(opts: KieSubmitOpts): Promise<string> {
  const key = keyOrThrow();

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
  };
  if (opts.imageInput && opts.imageInput.length > 0) input.image_input = opts.imageInput;
  if (opts.aspectRatio) input.aspect_ratio = opts.aspectRatio;
  if (opts.resolution) input.resolution = opts.resolution;
  if (opts.outputFormat) input.output_format = opts.outputFormat;

  const body: Record<string, unknown> = {
    model: opts.model ?? KIE_MODEL,
    input,
  };
  if (opts.callBackUrl) body.callBackUrl = opts.callBackUrl;

  const res = await fetch(`${KIE_BASE}/playground/createTask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new KieError(`HTTP_${res.status}`, errText.slice(0, 500));
  }

  const data = (await res.json()) as KieCreateResp;
  if (data.code !== 200 || !data.data?.taskId) {
    throw new KieError(`API_${data.code ?? 'unknown'}`, data.msg ?? 'kie create failed');
  }
  return data.data.taskId;
}

export type KieStatus =
  | { state: 'waiting' | 'processing'; taskId: string }
  | { state: 'success'; taskId: string; urls: string[]; creditsConsumed?: number }
  | { state: 'failed'; taskId: string; failCode: string; failMsg: string };

/** One-shot status fetch. */
export async function getTaskStatus(taskId: string): Promise<KieStatus> {
  const key = keyOrThrow();

  const res = await fetch(
    `${KIE_BASE}/playground/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new KieError(`HTTP_${res.status}`, (await res.text().catch(() => '')).slice(0, 500));
  }

  const data = (await res.json()) as KieRecordResp;
  if (!data.data) return { state: 'waiting', taskId };

  const d = data.data;
  if (d.state === 'success') {
    let urls: string[] = [];
    try {
      const parsed = d.resultJson ? JSON.parse(d.resultJson) : null;
      if (parsed && typeof parsed === 'object') {
        const p = parsed as { resultUrls?: unknown; image_url?: unknown; url?: unknown };
        if (Array.isArray(p.resultUrls)) {
          urls = p.resultUrls.filter((u): u is string => typeof u === 'string');
        } else if (typeof p.image_url === 'string') {
          urls = [p.image_url];
        } else if (typeof p.url === 'string') {
          urls = [p.url];
        }
      }
    } catch {
      // resultJson не парсится — отдадим failed
    }
    if (urls.length === 0) {
      return {
        state: 'failed',
        taskId,
        failCode: 'NO_RESULT_URLS',
        failMsg: `resultJson did not contain usable URLs: ${d.resultJson?.slice(0, 200) ?? ''}`,
      };
    }
    return { state: 'success', taskId, urls, creditsConsumed: d.creditsConsumed };
  }

  if (d.state === 'failed') {
    return {
      state: 'failed',
      taskId,
      failCode: d.failCode ?? 'FAILED',
      failMsg: d.failMsg ?? 'kie job failed',
    };
  }

  return { state: d.state, taskId };
}

/** Poll until the task finishes (success | failed) or times out. */
export async function waitForTask(taskId: string): Promise<KieStatus> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const s = await getTaskStatus(taskId);
    if (s.state === 'success' || s.state === 'failed') return s;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new KieError('TIMEOUT', `task ${taskId} did not finish within ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms`);
}

/** Download bytes from a kie CDN URL. */
export async function downloadImage(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new KieError(`DL_HTTP_${res.status}`, `download failed: ${url}`);
  const mime = res.headers.get('content-type') ?? 'image/jpeg';
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), mime };
}

/**
 * Высокоуровневый wrapper: prompt + опциональная reference image → bytes готового результата.
 * Используется в воркерах вместо старого generateImageFromReference().
 *
 * Параметр `referenceImageUrl` может быть либо публичной HTTPS URL,
 * либо data:URI ("data:image/jpeg;base64,...") — kie проглатывает оба.
 */
export async function generateImage(opts: {
  prompt: string;
  referenceImageUrl?: string;     // публично доступная URL или data URI
  aspectRatio?: KieAspect;
  resolution?: KieResolution;
  outputFormat?: KieFormat;
}): Promise<{ bytes: Buffer; mime: string; taskId: string; creditsConsumed?: number }> {
  const taskId = await submitTask({
    prompt: opts.prompt,
    imageInput: opts.referenceImageUrl ? [opts.referenceImageUrl] : undefined,
    aspectRatio: opts.aspectRatio ?? '3:4',
    resolution: opts.resolution ?? '1K',
    outputFormat: opts.outputFormat ?? 'jpg',
  });

  const result = await waitForTask(taskId);
  if (result.state !== 'success') {
    const fail = result as { failCode: string; failMsg: string };
    throw new KieError(fail.failCode, fail.failMsg);
  }

  const first = result.urls[0];
  const { bytes, mime } = await downloadImage(first);
  return { bytes, mime, taskId, creditsConsumed: result.creditsConsumed };
}

// ── Flux Kontext Pro (identity-preserving edit) ───────────────────
// Ср. Nano Banana 2 (которая generative и может сгаллюцинировать лицо),
// Flux Kontext специально создан для edit с сохранением лица —
// меняет окружение/одежду/стиль, оставляя identity нетронутой.
//
//   POST https://api.kie.ai/api/v1/flux/kontext/generate
//     body: { model: "flux-kontext-pro", prompt, inputImage, aspectRatio, outputFormat }
//     → { code: 200, data: { taskId } }
//   GET  https://api.kie.ai/api/v1/flux/kontext/record-info?taskId=<id>
//     → { code: 200, data: { successFlag, response: { resultImageUrl }, errorMessage } }
//
// Validated 2026-05-21 на Unsplash portrait → luxury founder edit.

const FLUX_BASE = process.env.KIE_FLUX_BASE_URL ?? 'https://api.kie.ai/api/v1/flux/kontext';
const FLUX_MODEL = process.env.KIE_FLUX_MODEL ?? 'flux-kontext-pro';

export type FluxAspect = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';

export type FluxSubmitOpts = {
  prompt: string;
  inputImageUrl?: string;     // публичная URL — обязательна для edit-режима
  aspectRatio?: FluxAspect;
  outputFormat?: 'jpeg' | 'png';
  model?: string;
  safetyTolerance?: number;
};

type FluxCreateResp = {
  code: number;
  msg?: string;
  data?: { taskId?: string };
};

type FluxRecordResp = {
  code: number;
  data?: {
    taskId: string;
    successFlag?: number;       // 1 == success
    completeTime?: string | null;
    response?: { originImageUrl?: string | null; resultImageUrl?: string | null } | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  };
};

export async function submitFluxKontext(opts: FluxSubmitOpts): Promise<string> {
  const key = keyOrThrow();
  const body: Record<string, unknown> = {
    model: opts.model ?? FLUX_MODEL,
    prompt: opts.prompt,
    aspectRatio: opts.aspectRatio ?? '3:4',
    outputFormat: opts.outputFormat ?? 'jpeg',
    safetyTolerance: opts.safetyTolerance ?? 2,
  };
  if (opts.inputImageUrl) body.inputImage = opts.inputImageUrl;

  const res = await fetch(`${FLUX_BASE}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  if (!res.ok) throw new KieError(`FLUX_HTTP_${res.status}`, (await res.text().catch(() => '')).slice(0, 400));

  const data = (await res.json()) as FluxCreateResp;
  if (data.code !== 200 || !data.data?.taskId) {
    throw new KieError(`FLUX_API_${data.code}`, data.msg ?? 'flux submit failed');
  }
  return data.data.taskId;
}

export type FluxStatus =
  | { state: 'processing'; taskId: string }
  | { state: 'success'; taskId: string; resultUrl: string }
  | { state: 'failed'; taskId: string; failCode: string; failMsg: string };

export async function getFluxKontextStatus(taskId: string): Promise<FluxStatus> {
  const key = keyOrThrow();
  const res = await fetch(`${FLUX_BASE}/record-info?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
  });
  if (!res.ok) throw new KieError(`FLUX_STATUS_HTTP_${res.status}`, (await res.text().catch(() => '')).slice(0, 400));

  const data = (await res.json()) as FluxRecordResp;
  const d = data.data;
  if (!d) return { state: 'processing', taskId };

  if (d.successFlag === 1 && d.response?.resultImageUrl) {
    return { state: 'success', taskId, resultUrl: d.response.resultImageUrl };
  }
  if (d.errorCode || d.errorMessage) {
    return {
      state: 'failed',
      taskId,
      failCode: d.errorCode ?? 'FAILED',
      failMsg: d.errorMessage ?? 'flux failed',
    };
  }
  return { state: 'processing', taskId };
}

export async function waitForFluxKontext(taskId: string): Promise<FluxStatus> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const s = await getFluxKontextStatus(taskId);
    if (s.state === 'success' || s.state === 'failed') return s;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new KieError('TIMEOUT', `flux task ${taskId} did not finish in ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms`);
}

/**
 * Высокоуровневый identity-preserving edit. inputImageUrl должна быть публично доступна
 * (kie сервер сам скачивает) — для local dev перезаливай в R2/MinIO или используй
 * existing public URL из media.46-62-215-11.nip.io.
 */
export async function generateImageWithFlux(opts: {
  prompt: string;
  inputImageUrl: string;
  aspectRatio?: FluxAspect;
  outputFormat?: 'jpeg' | 'png';
}): Promise<{ bytes: Buffer; mime: string; taskId: string }> {
  const taskId = await submitFluxKontext({
    prompt: opts.prompt,
    inputImageUrl: opts.inputImageUrl,
    aspectRatio: opts.aspectRatio ?? '3:4',
    outputFormat: opts.outputFormat ?? 'jpeg',
  });
  const result = await waitForFluxKontext(taskId);
  if (result.state !== 'success') {
    const fail = result as { failCode: string; failMsg: string };
    throw new KieError(fail.failCode, fail.failMsg);
  }
  const { bytes, mime } = await downloadImage(result.resultUrl);
  return { bytes, mime, taskId };
}

/**
 * Решает, отдавать ли kie URL «как есть», или закодировать как data:URI
 * (требуется когда S3 на localhost — kie с серверов не достанет).
 */
export async function toKieReference(opts: {
  fileUrl: string;
  mime: string;
  fetchBytes?: () => Promise<Buffer>;
}): Promise<string> {
  const publicBase = process.env.S3_PUBLIC_URL ?? '';
  const localish = /localhost|127\.0\.0\.1|::1/.test(publicBase);
  if (!localish && opts.fileUrl.startsWith('http')) {
    return opts.fileUrl;
  }
  // local dev — encode as data URI
  if (!opts.fetchBytes) {
    const res = await fetch(opts.fileUrl);
    if (!res.ok) throw new KieError(`REF_HTTP_${res.status}`, `failed to fetch ref for inlining`);
    const ab = await res.arrayBuffer();
    return `data:${opts.mime};base64,${Buffer.from(ab).toString('base64')}`;
  }
  const buf = await opts.fetchBytes();
  return `data:${opts.mime};base64,${buf.toString('base64')}`;
}
