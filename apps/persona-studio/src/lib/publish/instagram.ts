// Instagram Graph API client — OAuth (Facebook Login for Business) + Content
// Publishing (Reels).
//
// Flow overview:
//   1. OAuth: redirect user to facebook.com/{v}/dialog/oauth with scopes
//      instagram_basic, instagram_content_publish, pages_show_list,
//      business_management. Callback returns a short-lived code.
//   2. exchangeCode(code) → short-lived user token.
//   3. toLongLivedToken(short) → ~60-day token (stored encrypted).
//   4. discoverIgAccount(token) → walk /me/accounts (FB Pages) → each page's
//      connected instagram_business_account → pick the first one.
//   5. Publish: createReelContainer → poll getContainerStatus until FINISHED →
//      publishContainer → getPermalink.
//
// IMPORTANT: video_url must be PUBLICLY reachable by Meta's servers — we pass
// the S3 public URL (snapshotted in ScheduledPost.mediaUrl).
//
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing

import { env } from '@/lib/env';

export class InstagramError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InstagramError';
  }
}

const GRAPH = 'https://graph.facebook.com';
const OAUTH_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'business_management',
];

function version(): string {
  return env.IG_GRAPH_VERSION || 'v21.0';
}

function appId(): string {
  if (!env.META_APP_ID) throw new InstagramError('META_NOT_CONFIGURED', 'META_APP_ID not set');
  return env.META_APP_ID;
}

function appSecret(): string {
  if (!env.META_APP_SECRET) throw new InstagramError('META_NOT_CONFIGURED', 'META_APP_SECRET not set');
  return env.META_APP_SECRET;
}

function redirectUri(): string {
  if (!env.META_OAUTH_REDIRECT)
    throw new InstagramError('META_NOT_CONFIGURED', 'META_OAUTH_REDIRECT not set');
  return env.META_OAUTH_REDIRECT;
}

/** True when all Meta OAuth env is present — gate the IG connect UI on this. */
export function instagramConfigured(): boolean {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_OAUTH_REDIRECT);
}

type GraphErrorBody = { error?: { message?: string; code?: number; type?: string } };

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${version()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  return parse<T>(res);
}

async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${version()}/${path}`);
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    if (!res.ok) throw new InstagramError(`HTTP_${res.status}`, text.slice(0, 300));
    throw new InstagramError('BAD_JSON', text.slice(0, 300));
  }
  if (!res.ok) {
    const err = (json as GraphErrorBody).error;
    throw new InstagramError(
      `GRAPH_${err?.code ?? res.status}`,
      err?.message ?? `Graph API HTTP ${res.status}`,
    );
  }
  return json as T;
}

// ── OAuth ────────────────────────────────────────────────────

export function oauthStartUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${version()}/dialog/oauth`);
  url.searchParams.set('client_id', appId());
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', OAUTH_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<string> {
  const data = await graphGet<{ access_token: string }>('oauth/access_token', {
    client_id: appId(),
    client_secret: appSecret(),
    redirect_uri: redirectUri(),
    code,
  });
  return data.access_token;
}

/** Exchange a short-lived token for a ~60-day long-lived one. */
export async function toLongLivedToken(
  shortToken: string,
): Promise<{ token: string; expiresInSec: number }> {
  const data = await graphGet<{ access_token: string; expires_in?: number }>(
    'oauth/access_token',
    {
      grant_type: 'fb_exchange_token',
      client_id: appId(),
      client_secret: appSecret(),
      fb_exchange_token: shortToken,
    },
  );
  return { token: data.access_token, expiresInSec: data.expires_in ?? 60 * 24 * 3600 };
}

export type DiscoveredIgAccount = {
  igUserId: string;
  username: string;
  fbPageId: string;
  pageName: string;
};

/** Find the first Instagram business account connected to one of the user's FB Pages. */
export async function discoverIgAccount(token: string): Promise<DiscoveredIgAccount> {
  type Page = {
    id: string;
    name: string;
    instagram_business_account?: { id: string; username?: string };
  };
  const data = await graphGet<{ data: Page[] }>('me/accounts', {
    access_token: token,
    fields: 'id,name,instagram_business_account{id,username}',
  });
  const page = (data.data ?? []).find((p) => p.instagram_business_account?.id);
  if (!page || !page.instagram_business_account) {
    throw new InstagramError(
      'NO_IG_BUSINESS_ACCOUNT',
      'Ни одна из ваших Facebook-страниц не связана с Instagram Business-аккаунтом',
    );
  }
  const ig = page.instagram_business_account;
  return {
    igUserId: ig.id,
    username: ig.username ?? '',
    fbPageId: page.id,
    pageName: page.name,
  };
}

// ── Content Publishing (Reels) ────────────────────────────────

/** Create a Reel media container. Returns the container (creation) id. */
export async function createReelContainer(opts: {
  igUserId: string;
  token: string;
  videoUrl: string;
  caption?: string;
}): Promise<string> {
  const params: Record<string, string> = {
    access_token: opts.token,
    media_type: 'REELS',
    video_url: opts.videoUrl,
    share_to_feed: 'true',
  };
  if (opts.caption) params.caption = opts.caption.slice(0, 2200);
  const data = await graphPost<{ id: string }>(`${opts.igUserId}/media`, params);
  return data.id;
}

export type ContainerStatus = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';

export async function getContainerStatus(opts: {
  containerId: string;
  token: string;
}): Promise<ContainerStatus> {
  const data = await graphGet<{ status_code: ContainerStatus }>(opts.containerId, {
    access_token: opts.token,
    fields: 'status_code',
  });
  return data.status_code;
}

/** Poll the container until FINISHED, throwing on ERROR/EXPIRED or timeout. */
export async function waitForContainer(opts: {
  containerId: string;
  token: string;
  maxMs?: number;
  intervalMs?: number;
}): Promise<void> {
  const maxMs = opts.maxMs ?? 5 * 60_000;
  const intervalMs = opts.intervalMs ?? 6_000;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const status = await getContainerStatus(opts);
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new InstagramError('CONTAINER_FAILED', `Media container status: ${status}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new InstagramError('CONTAINER_TIMEOUT', 'Media container did not finish in time');
}

/** Publish a finished container. Returns the published IG media id. */
export async function publishContainer(opts: {
  igUserId: string;
  token: string;
  containerId: string;
}): Promise<string> {
  const data = await graphPost<{ id: string }>(`${opts.igUserId}/media_publish`, {
    access_token: opts.token,
    creation_id: opts.containerId,
  });
  return data.id;
}

export async function getPermalink(opts: {
  mediaId: string;
  token: string;
}): Promise<string | null> {
  try {
    const data = await graphGet<{ permalink?: string }>(opts.mediaId, {
      access_token: opts.token,
      fields: 'permalink',
    });
    return data.permalink ?? null;
  } catch {
    return null; // permalink is best-effort; publishing already succeeded
  }
}

/** End-to-end: container → wait → publish → permalink. */
export async function publishReel(opts: {
  igUserId: string;
  token: string;
  videoUrl: string;
  caption?: string;
}): Promise<{ mediaId: string; permalink: string | null }> {
  const containerId = await createReelContainer(opts);
  await waitForContainer({ containerId, token: opts.token });
  const mediaId = await publishContainer({
    igUserId: opts.igUserId,
    token: opts.token,
    containerId,
  });
  const permalink = await getPermalink({ mediaId, token: opts.token });
  return { mediaId, permalink };
}
