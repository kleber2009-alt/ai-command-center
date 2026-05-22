// OmniHuman 1.5 client — ByteDance lifelike avatar via kie.ai playground API.
//
// Flow (mirrors kie.ts createTask/recordInfo pattern):
//
//   POST {KIE_BASE}/playground/createTask
//        Authorization: Bearer <KIE_API_KEY>
//        body: { model: <KIE_OMNIHUMAN_MODEL>, input: { image_url, audio_url, aspect_ratio? } }
//        → { code: 200, data: { taskId } }
//
//   GET  {KIE_BASE}/playground/recordInfo?taskId=<id>
//        → { code: 200, data: { state, resultJson, failCode, failMsg } }
//
//   resultJson: { resultUrls: [<mp4 url>] }
//
// OmniHuman constraints (validated via aimlapi + piapi docs):
//   - audio file MUST be publicly fetchable; ≤ 30 seconds
//   - image MUST contain a clear single face
//   - output is mp4 (1080p), aspect comes from input image unless overridden
//
// Model slug на kie может отличаться от провайдера к провайдеру; держим
// в env (KIE_OMNIHUMAN_MODEL) с дефолтом 'bytedance-omnihuman-1.5'.

import { env } from './env';

const SUBMIT_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 5_000;

export class OmnihumanError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'OmnihumanError';
  }
}

export type OmniAspect = 'auto' | '1:1' | '16:9' | '9:16';

export type OmniSubmitOpts = {
  imageUrl: string;
  audioUrl: string;
  aspectRatio?: OmniAspect;
  prompt?: string;
  model?: string;
};

type KieCreateResp = {
  code: number;
  msg?: string;
  data?: { taskId?: string; recordId?: string };
};

type KieState = 'waiting' | 'processing' | 'success' | 'failed';

type KieRecordResp = {
  code: number;
  data?: {
    taskId: string;
    state: KieState;
    resultJson?: string;
    failCode?: string | null;
    failMsg?: string | null;
    creditsConsumed?: number;
  };
};

export async function submitOmnihuman(opts: OmniSubmitOpts): Promise<string> {
  const input: Record<string, unknown> = {
    image_url: opts.imageUrl,
    audio_url: opts.audioUrl,
  };
  if (opts.aspectRatio) input.aspect_ratio = opts.aspectRatio;
  if (opts.prompt) input.prompt = opts.prompt;

  const body = {
    model: opts.model ?? env.KIE_OMNIHUMAN_MODEL,
    input,
  };

  const res = await fetch(`${env.KIE_BASE_URL}/playground/createTask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OmnihumanError(`HTTP_${res.status}`, text.slice(0, 500));
  }

  const data = (await res.json()) as KieCreateResp;
  if (data.code !== 200 || !data.data?.taskId) {
    throw new OmnihumanError(`API_${data.code ?? 'unknown'}`, data.msg ?? 'omnihuman submit failed');
  }
  return data.data.taskId;
}

export type OmniStatus =
  | { state: 'waiting' | 'processing'; taskId: string }
  | { state: 'success'; taskId: string; videoUrl: string; creditsConsumed?: number }
  | { state: 'failed'; taskId: string; failCode: string; failMsg: string };

export async function getOmnihumanStatus(taskId: string): Promise<OmniStatus> {
  const res = await fetch(
    `${env.KIE_BASE_URL}/playground/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    {
      headers: { Authorization: `Bearer ${env.KIE_API_KEY}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new OmnihumanError(`HTTP_${res.status}`, (await res.text().catch(() => '')).slice(0, 400));
  }

  const data = (await res.json()) as KieRecordResp;
  const d = data.data;
  if (!d) return { state: 'waiting', taskId };

  if (d.state === 'success') {
    let videoUrl: string | null = null;
    try {
      const parsed = d.resultJson ? JSON.parse(d.resultJson) : null;
      if (parsed && typeof parsed === 'object') {
        const p = parsed as {
          resultUrls?: unknown;
          video_url?: unknown;
          videoUrl?: unknown;
          url?: unknown;
        };
        if (Array.isArray(p.resultUrls)) {
          const u = p.resultUrls.find((x): x is string => typeof x === 'string');
          if (u) videoUrl = u;
        } else if (typeof p.video_url === 'string') {
          videoUrl = p.video_url;
        } else if (typeof p.videoUrl === 'string') {
          videoUrl = p.videoUrl;
        } else if (typeof p.url === 'string') {
          videoUrl = p.url;
        }
      }
    } catch {
      // fallthrough to failed
    }
    if (!videoUrl) {
      return {
        state: 'failed',
        taskId,
        failCode: 'NO_RESULT_URL',
        failMsg: `resultJson did not contain a usable URL: ${d.resultJson?.slice(0, 200) ?? ''}`,
      };
    }
    return { state: 'success', taskId, videoUrl, creditsConsumed: d.creditsConsumed };
  }

  if (d.state === 'failed') {
    return {
      state: 'failed',
      taskId,
      failCode: d.failCode ?? 'FAILED',
      failMsg: d.failMsg ?? 'omnihuman job failed',
    };
  }

  return { state: d.state, taskId };
}

/**
 * Poll until task completes (success → returns videoUrl) or fails (throws).
 * Deadline — env.OMNIHUMAN_MAX_POLL_MS by default; override via opts.maxMs.
 */
export async function waitForOmnihuman(opts: {
  taskId: string;
  maxMs?: number;
}): Promise<string> {
  const deadline = Date.now() + (opts.maxMs ?? env.OMNIHUMAN_MAX_POLL_MS);
  while (Date.now() < deadline) {
    const s = await getOmnihumanStatus(opts.taskId);
    if (s.state === 'success') return s.videoUrl;
    if (s.state === 'failed') {
      throw new OmnihumanError(s.failCode, s.failMsg);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new OmnihumanError(
    'TIMEOUT',
    `task ${opts.taskId} did not finish within ${opts.maxMs ?? env.OMNIHUMAN_MAX_POLL_MS}ms`,
  );
}

export async function downloadVideo(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new OmnihumanError(`DL_HTTP_${res.status}`, `download failed: ${url}`);
  const mime = res.headers.get('content-type') ?? 'video/mp4';
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), mime };
}
