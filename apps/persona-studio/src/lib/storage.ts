import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION ?? 'us-east-1';
const bucket = process.env.S3_BUCKET ?? 'persona-studio-media';
const publicBase = process.env.S3_PUBLIC_URL ?? endpoint + '/' + bucket;
const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true';

export const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
});

export const BUCKET = bucket;

export type UploadKind = 'original' | 'avatar' | 'cover' | 'video';

export function keyFor(kind: UploadKind, userId: string, ext: string) {
  const safeExt = ext.replace(/^\./, '').toLowerCase().slice(0, 8);
  return `${kind}/${userId}/${Date.now()}-${nanoid(8)}.${safeExt}`;
}

export async function uploadBuffer(opts: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl ?? 'public, max-age=31536000, immutable',
    }),
  );
  return publicUrl(opts.key);
}

export function publicUrl(key: string) {
  return `${publicBase.replace(/\/$/, '')}/${key}`;
}

export async function signedDownloadUrl(key: string, ttlSec = 60 * 10) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: ttlSec,
  });
}

export async function signedUploadUrl(key: string, contentType: string, ttlSec = 60 * 5) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: ttlSec },
  );
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  return map[mime] ?? 'bin';
}
