// PostMyPost API client (https://postmypost.io) — official SMM API used for
// Instagram autoposting.
//
// Why a third-party service instead of Meta Graph directly: PostMyPost handles
// the IG Business OAuth, token refresh, and Content Publishing on their side
// via official integrations. We only need one project-level Bearer token; the
// user connects their Instagram inside the PostMyPost dashboard and we
// reference its numeric account_id + project_id.
//
// Flow used here:
//   1. discoverInstagramAccounts() — projects → accounts, filtered to the
//      Instagram channel (code 'instagram') + CONNECTED — for the connect UI.
//   2. uploadVideoByUrl(projectId, url) — /upload/init {project_id,url} →
//      poll /upload/status until file_id (status 1). PostMyPost fetches our
//      public S3 mp4 itself, so no file streaming on our side.
//   3. createReelPublication(...) — POST /publications, PENDING_PUBLICATION,
//      publication_type=REELS, file_ids=[fileId]. Returns the publication id.
//
// Docs: https://help.postmypost.io/docs/api  ·  SDKs: github.com/postmypost
//
// Enums (from the OpenAPI spec):
//   publication_status: 4 draft · 5 pending_publication · …
//   publication_type:   1 post · 2 story · 4 reels/shorts/clips
//   upload status:      1 ok · 2 error · 3 processing · 4 uploading · 5 waiting
//   account connection: 1 connected · 2 auth_required

import { env } from '@/lib/env';

export class PostMyPostError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PostMyPostError';
  }
}

const INSTAGRAM_CHANNEL_CODE = 'instagram';
const STATUS_PENDING_PUBLICATION = 5;
const TYPE_REELS = 4;
const UPLOAD_OK = 1;
const UPLOAD_ERROR = 2;
const CONNECTION_CONNECTED = 1;

export function postmypostConfigured(): boolean {
  return Boolean(env.POSTMYPOST_API_TOKEN);
}

function token(): string {
  if (!env.POSTMYPOST_API_TOKEN) {
    throw new PostMyPostError('NOT_CONFIGURED', 'POSTMYPOST_API_TOKEN не задан');
  }
  return env.POSTMYPOST_API_TOKEN;
}

function base(): string {
  return env.POSTMYPOST_API_BASE || 'https://api.postmypost.io/v4.1';
}

type Method = 'GET' | 'POST';

async function call<T>(method: Method, path: string, opts?: { query?: Record<string, string | number>; body?: unknown }): Promise<T> {
  const url = new URL(`${base()}${path}`);
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/json',
      ...(opts?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw new PostMyPostError(`HTTP_${res.status}`, text.slice(0, 300));
  }
  if (!res.ok) {
    const msg = (json as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new PostMyPostError(`HTTP_${res.status}`, msg);
  }
  return json as T;
}

// ── Discovery (connect UI) ────────────────────────────────────

type PmpListResponse<T> = { data: T[]; pages?: { next: number | null } };
type PmpProject = { id: number; name: string; timezone_id?: number };
type PmpChannel = { id: number; code: string; name: string };
type PmpAccount = {
  id: number;
  chanel_id: number; // sic — spelling per API
  external_id?: string;
  name: string;
  login?: string;
  connection_status: number;
};

export type AvailableIgAccount = {
  accountId: number;
  projectId: number;
  projectName: string;
  name: string;
  login: string | null;
};

async function instagramChannelId(): Promise<number | null> {
  const res = await call<PmpListResponse<PmpChannel>>('GET', '/channels', { query: { per_page: 50 } });
  const ig = (res.data ?? []).find((c) => c.code === INSTAGRAM_CHANNEL_CODE);
  return ig?.id ?? null;
}

/**
 * Enumerate Instagram accounts the user has connected inside PostMyPost,
 * across all their projects. Used to populate the connect picker.
 */
export async function discoverInstagramAccounts(): Promise<AvailableIgAccount[]> {
  const igChannelId = await instagramChannelId();
  if (igChannelId == null) return [];

  const projectsRes = await call<PmpListResponse<PmpProject>>('GET', '/projects', { query: { per_page: 50 } });
  const projects = projectsRes.data ?? [];

  const out: AvailableIgAccount[] = [];
  for (const project of projects) {
    const accRes = await call<PmpListResponse<PmpAccount>>('GET', '/accounts', {
      query: { project_id: project.id, per_page: 50 },
    });
    for (const a of accRes.data ?? []) {
      if (a.chanel_id === igChannelId && a.connection_status === CONNECTION_CONNECTED) {
        out.push({
          accountId: a.id,
          projectId: project.id,
          projectName: project.name,
          name: a.name,
          login: a.login ?? null,
        });
      }
    }
  }
  return out;
}

// ── Publishing ────────────────────────────────────────────────

/**
 * Upload a video by public URL and return the PostMyPost file id to attach to
 * a publication. PostMyPost downloads the URL server-side; we poll until the
 * file is processed.
 */
export async function uploadVideoByUrl(opts: {
  projectId: number;
  url: string;
  maxMs?: number;
  intervalMs?: number;
}): Promise<number> {
  const init = await call<{ id: number; status: number }>('POST', '/upload/init', {
    body: { project_id: opts.projectId, url: opts.url },
  });

  const maxMs = opts.maxMs ?? 5 * 60_000;
  const intervalMs = opts.intervalMs ?? 4_000;
  const deadline = Date.now() + maxMs;
  let triedComplete = false;

  while (Date.now() < deadline) {
    const st = await call<{ id: number; file_id?: number; status: number }>('GET', '/upload/status', {
      query: { id: init.id },
    });
    if (st.status === UPLOAD_OK && st.file_id) return st.file_id;
    if (st.status === UPLOAD_ERROR) {
      throw new PostMyPostError('UPLOAD_FAILED', `PostMyPost upload status=error (id ${init.id})`);
    }
    // status 5 = waiting_for_upload: nudge it once with /complete, then keep polling.
    if (st.status === 5 && !triedComplete) {
      triedComplete = true;
      await call('POST', '/upload/complete', { query: { id: init.id } }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new PostMyPostError('UPLOAD_TIMEOUT', `PostMyPost upload did not finish in time (id ${init.id})`);
}

/**
 * Create a scheduled Reel publication. post_at is an ISO datetime; PostMyPost
 * publishes at that time via its official IG integration. Returns the
 * publication id.
 */
export async function createReelPublication(opts: {
  projectId: number;
  accountId: number;
  fileId: number;
  caption?: string;
  postAt: Date;
}): Promise<number> {
  const res = await call<{ id: number }>('POST', '/publications', {
    body: {
      project_id: opts.projectId,
      post_at: opts.postAt.toISOString(),
      account_ids: [opts.accountId],
      publication_status: STATUS_PENDING_PUBLICATION,
      details: [
        {
          account_id: opts.accountId,
          publication_type: TYPE_REELS,
          content: opts.caption?.slice(0, 2200) ?? undefined,
          file_ids: [opts.fileId],
          instagram_share_to_feed: true,
        },
      ],
    },
  });
  return res.id;
}
