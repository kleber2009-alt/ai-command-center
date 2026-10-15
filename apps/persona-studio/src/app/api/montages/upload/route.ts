// POST /api/montages/upload — загрузка своей записи (лицо / скринкаст) под
// монтаж по скиллу. Тело — сырой файл (fetch(url, { body: file })), заголовок
// Content-Type video/*. Стримим прямо в S3, не держа файл в памяти.
// Ответ: { url } — передаётся в POST /api/montages как sourceUrl.

import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { BUCKET, keyFor, publicUrl, s3 } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 500 * 1024 * 1024; // 500 МБ
const EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};

export async function POST(req: NextRequest) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXT[mime];
  if (!ext) {
    return NextResponse.json({ error: 'unsupported_mime', mime, allowed: Object.keys(EXT) }, { status: 415 });
  }
  const len = Number(req.headers.get('content-length') ?? 0);
  if (!len) return NextResponse.json({ error: 'length_required' }, { status: 411 });
  if (len > MAX_BYTES) return NextResponse.json({ error: 'file_too_large', bytes: len, max: MAX_BYTES }, { status: 413 });
  if (!req.body) return NextResponse.json({ error: 'empty_body' }, { status: 400 });

  const key = keyFor('video', auth.user.id, ext);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Readable.fromWeb(req.body as unknown as WebReadableStream),
      ContentLength: len,
      ContentType: mime,
      CacheControl: 'private, max-age=86400',
    }),
  );
  return NextResponse.json({ ok: true, url: publicUrl(key), bytes: len });
}
