import { randomBytes } from 'crypto';
import { serviceClient } from './supabase/server';
import { MediaKind } from './types';

/**
 * Media upload helper (spec 6). Streams an uploaded file into the public
 * `cdd-media` Supabase Storage bucket under a random path and returns its
 * public URL plus the derived media kind.
 */
export const MEDIA_BUCKET = 'cdd-media';

const MIME_KIND: Record<string, MediaKind> = {
  'image/': 'image',
  'video/': 'video',
};

export function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'text';
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[mime] ?? 'bin';
}

export async function uploadMedia(
  data: ArrayBuffer | Buffer,
  contentType: string,
  prefix = 'items',
): Promise<{ url: string; mediaKind: MediaKind }> {
  const mediaKind = kindFromMime(contentType);
  if (mediaKind === 'text') throw new Error('unsupported media type');

  const path = `${prefix}/${Date.now()}-${randomBytes(8).toString('hex')}.${extFromMime(contentType)}`;
  const db = serviceClient();

  const { error } = await db.storage
    .from(MEDIA_BUCKET)
    .upload(path, data, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message);

  const { data: pub } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl, mediaKind };
}

export { MIME_KIND };
