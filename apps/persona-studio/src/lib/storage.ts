import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET || "persona-studio";
const publicBase = process.env.R2_PUBLIC_BASE_URL || "";

export const s3 = new S3Client({
  region: "auto",
  endpoint: accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : undefined,
  credentials:
    process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export function publicUrl(key: string): string {
  if (!publicBase) return `r2://${bucket}/${key}`;
  return `${publicBase.replace(/\/$/, "")}/${key}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<{ key: string; url: string }> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return { key, url: publicUrl(key) };
}

export async function signedGetUrl(key: string, expiresIn = 3600) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn,
  });
}

export function uploadKey(userId: string, ext: string) {
  return `uploads/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

export function avatarKey(userId: string, generationId: string, idx: number) {
  return `avatars/${userId}/${generationId}/${idx}.png`;
}

export function coverKey(userId: string, id: string) {
  return `covers/${userId}/${id}.png`;
}
