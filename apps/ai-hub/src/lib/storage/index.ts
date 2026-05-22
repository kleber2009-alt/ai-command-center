// MinIO / S3 client.
//
// Two clients:
//   - internalClient: для PUT/GET изнутри docker network (быстро, без Caddy hop).
//                     Endpoint = S3_ENDPOINT (e.g. http://aisales-minio:9000)
//   - publicClient:   для генерации presigned URLs, которые отдаём в браузер.
//                     Endpoint = S3_PUBLIC_ENDPOINT (e.g. https://media.46-62-215-11.nip.io)
//
// Разделение нужно потому что S3 SigV4 включает Host header в подпись — если
// подписать internal URL и отдать в браузер с external Host, подпись не сойдётся.

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _internal: S3Client | null = null;
let _public: S3Client | null = null;

function internalClient(): S3Client {
  if (_internal) return _internal;
  _internal = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
  return _internal;
}

function publicClient(): S3Client {
  if (_public) return _public;
  // Fallback to internal endpoint if PUBLIC not set — URLs won't work in
  // browser but at least stays consistent for testing.
  const endpoint = process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT;
  _public = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
  return _public;
}

function bucket() {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not set");
  return b;
}

export async function putObject(key: string, body: Buffer | Uint8Array, contentType?: string) {
  await internalClient().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: body, ContentType: contentType,
  }));
  return { key, bucket: bucket() };
}

export async function deleteObject(key: string) {
  await internalClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function presignGet(key: string, expiresSec = 3600) {
  return getSignedUrl(publicClient(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: expiresSec });
}

export async function presignPut(key: string, contentType?: string, expiresSec = 600) {
  return getSignedUrl(publicClient(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresSec });
}

/** Download an external (provider) URL and upload to our bucket.
 *  Used by webhook handlers to persist provider results before signed URLs expire. */
export async function ingestFromUrl(url: string, key: string, contentType?: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ingest fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = contentType ?? res.headers.get("content-type") ?? undefined;
  await putObject(key, buf, mime);
  return { key, bucket: bucket(), size: buf.byteLength, mimeType: mime ?? null };
}
