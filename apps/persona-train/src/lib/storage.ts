import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const VOICE_NOTES_DIR = process.env.VOICE_NOTES_DIR || '/data/voice-notes';
const VIDEO_NOTES_DIR = process.env.VIDEO_NOTES_DIR || '/data/video-notes';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;

const s3 =
  S3_ENDPOINT && S3_ACCESS_KEY && S3_SECRET_KEY && S3_BUCKET
    ? new S3Client({
        endpoint: S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
        forcePathStyle: true,
      })
    : null;

export function isS3Enabled(): boolean {
  return Boolean(s3);
}

function sanitizeOwner(owner: string): string {
  return String(owner || 'anon').replace(/[^a-z0-9._@-]/gi, '_');
}

export type StoredFile = {
  storageKind: 'fs' | 's3';
  storagePath: string;
  publicUrl: string;
};

export async function storeVoiceSample(
  audio: ArrayBuffer | Buffer,
  ownerHandle: string,
  ext = 'mp3',
): Promise<StoredFile> {
  return storeFile(audio, ownerHandle, ext, 'voice-notes', VOICE_NOTES_DIR);
}

export async function storeVideoSample(
  video: ArrayBuffer | Buffer,
  ownerHandle: string,
  ext = 'mp4',
): Promise<StoredFile> {
  return storeFile(video, ownerHandle, ext, 'video-notes', VIDEO_NOTES_DIR);
}

async function storeFile(
  data: ArrayBuffer | Buffer,
  ownerHandle: string,
  ext: string,
  bucketPrefix: 'voice-notes' | 'video-notes',
  fsRoot: string,
): Promise<StoredFile> {
  const safeOwner = sanitizeOwner(ownerHandle);
  const filename = `${Date.now()}.${ext}`;
  const relPath = `${bucketPrefix}/${safeOwner}/${filename}`;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data));

  if (s3 && S3_BUCKET) {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: relPath,
        Body: buf,
        ContentType: extToMime(ext),
      }),
    );
    return {
      storageKind: 's3',
      storagePath: relPath,
      publicUrl: S3_PUBLIC_URL ? `${S3_PUBLIC_URL}/${relPath}` : '',
    };
  }

  const absPath = path.join(fsRoot, safeOwner, filename);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buf);
  return {
    storageKind: 'fs',
    storagePath: `${safeOwner}/${filename}`,
    publicUrl: `${PUBLIC_BASE_URL}/${bucketPrefix}/${safeOwner}/${filename}`,
  };
}

export async function readSample(
  storageKind: 'fs' | 's3',
  storagePath: string,
  bucketPrefix: 'voice-notes' | 'video-notes',
): Promise<Buffer> {
  if (storageKind === 's3') {
    if (!s3 || !S3_BUCKET) throw new Error('S3 not configured');
    const out = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: storagePath }));
    const chunks: Uint8Array[] = [];
    // @ts-expect-error Body is a stream
    for await (const chunk of out.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const fsRoot = bucketPrefix === 'voice-notes' ? VOICE_NOTES_DIR : VIDEO_NOTES_DIR;
  return fs.readFile(path.join(fsRoot, storagePath));
}

export async function presignGet(storagePath: string, expiresIn = 3600): Promise<string> {
  if (!s3 || !S3_BUCKET) throw new Error('S3 not configured');
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: storagePath }), {
    expiresIn,
  });
}

function extToMime(ext: string): string {
  const m: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    opus: 'audio/ogg',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return m[ext.toLowerCase()] || 'application/octet-stream';
}
