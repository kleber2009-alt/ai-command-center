import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SIGNED_URL_TTL_S } from '@vp/shared';

let client: S3Client | undefined;
function s3(): S3Client {
  if (!client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    client = new S3Client({
      region: 'auto',
      // R2 endpoint, or a local MinIO endpoint in dev.
      endpoint: process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: !!process.env.R2_ENDPOINT, // MinIO needs path-style
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return client;
}

const bucket = () => process.env.R2_BUCKET_VIDEO ?? 'viral-videos';

/** Presigned PUT for resumable/direct browser upload (§5.1). TTL 1h (§10). */
export function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    {
      expiresIn: SIGNED_URL_TTL_S,
    },
  );
}

/** Presigned GET for download / playback (§10). */
export function presignDownload(key: string): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: SIGNED_URL_TTL_S,
  });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function putJson(key: string, value: unknown): Promise<void> {
  await putObject(key, JSON.stringify(value), 'application/json');
}

export async function getJson<T>(key: string): Promise<T> {
  return JSON.parse((await getObjectBuffer(key)).toString('utf8')) as T;
}
