// «Мой блог»: copy Instagram media into our S3 at parse time. Instagram CDN
// URLs (scontent-*.cdninstagram.com, *.fbcdn.net) are signed and expire within
// days, while a remix can happen weeks later (skill: no earlier than 2–3 weeks
// after the original). So:
//   - carousel slide originals + every thumbnail → copied during /api/blog/run;
//   - reel mp4 → only for the top few reels at parse time (size cap), the rest
//     lazily via ensureOwnReelVideo() when a reel pipeline starts.
// Keys are stable per post (blog/<userId>/<shortcode>/…), so a re-run
// overwrites instead of piling up objects.

import { prisma } from '@/lib/prisma';
import { fetchMedia, keyFromPublicUrl, uploadBuffer } from '@/lib/storage';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

/** true when the URL already points at our bucket (nothing to copy). */
export function isOurs(url: string | null | undefined): boolean {
  return Boolean(url && keyFromPublicUrl(url));
}

function extFor(contentType: string, fallback: string): string {
  const t = contentType.toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('mp4')) return 'mp4';
  return fallback;
}

/**
 * Download `url` and store it under `keyBase.<ext>`. Returns our public URL,
 * or null when the source is gone / too big / not the expected media type
 * (the caller keeps the CDN URL as a best-effort fallback).
 */
export async function copyToS3(opts: {
  url: string;
  keyBase: string;
  kind: 'image' | 'video';
  maxBytes?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  if (isOurs(opts.url)) return opts.url;
  const maxBytes = opts.maxBytes ?? (opts.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
  try {
    const res = await fetchMedia(opts.url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? (opts.kind === 'video' ? 120_000 : 30_000)),
      headers: { 'User-Agent': 'Mozilla/5.0 (PersonaStudio media copy)' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (opts.kind === 'image' && ct && !ct.startsWith('image/')) return null;
    if (opts.kind === 'video' && ct && !/^(video\/|application\/octet-stream)/.test(ct)) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > maxBytes) return null;
    const ext = extFor(ct, opts.kind === 'video' ? 'mp4' : 'jpg');
    const contentType = ct || (opts.kind === 'video' ? 'video/mp4' : 'image/jpeg');
    return await uploadBuffer({
      key: `${opts.keyBase}.${ext}`,
      body: buf,
      contentType,
      cacheControl: 'public, max-age=31536000',
    });
  } catch (e) {
    console.warn('[blog/media] copy failed', opts.keyBase, (e as Error).message);
    return null;
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (it: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function postKeyBase(userId: string, shortcode: string | null, url: string): string {
  const slug = (shortcode || url.replace(/[^a-z0-9]+/gi, '-').slice(-40)).replace(/[^a-zA-Z0-9_-]/g, '');
  return `blog/${userId}/${slug || 'post'}`;
}

/**
 * Copy every carousel slide (in order). A slide that fails to copy keeps its
 * CDN URL so the order and count stay intact; the remix step re-tries those.
 */
export async function copySlides(userId: string, shortcode: string | null, url: string, slides: string[]): Promise<string[]> {
  const base = postKeyBase(userId, shortcode, url);
  return mapLimit(slides, 4, async (src, i) => {
    const copied = await copyToS3({ url: src, keyBase: `${base}/slide-${String(i + 1).padStart(2, '0')}`, kind: 'image' });
    return copied ?? src;
  });
}

/**
 * Reel pipeline helper: make sure the reel's mp4 lives in our S3 and return
 * its URL (null when the CDN link already expired — re-run «Обновить из
 * Instagram» to get a fresh one).
 */
export async function ensureOwnReelVideo(parserItemId: string): Promise<string | null> {
  const item = await prisma.parserItem.findUnique({
    where: { id: parserItemId },
    select: { id: true, userId: true, shortcode: true, url: true, videoUrl: true },
  });
  if (!item?.videoUrl) return null;
  if (isOurs(item.videoUrl)) return item.videoUrl;
  const copied = await copyToS3({
    url: item.videoUrl,
    keyBase: `${postKeyBase(item.userId, item.shortcode, item.url)}/video`,
    kind: 'video',
  });
  if (copied) await prisma.parserItem.update({ where: { id: item.id }, data: { videoUrl: copied } });
  return copied;
}
