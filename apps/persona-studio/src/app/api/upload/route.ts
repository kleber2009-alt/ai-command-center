import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extFromMime, keyFor, uploadBuffer } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024);
const MAX_FILES_PER_REQUEST = 10;
const ALLOWED = (process.env.ALLOWED_MIME_TYPES ??
  'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime')
  .split(',')
  .map((s) => s.trim());

const HEIC_MIMES = new Set(['image/heic', 'image/heif']);

async function storeOne(file: File, userId: string) {
  // Айфоновские .heic/.heif иногда приходят с пустым mime — определяем по имени.
  const looksHeicByName = /\.(heic|heif)$/i.test(file.name);
  const detectedMime = file.type || (looksHeicByName ? 'image/heic' : '');
  if (!ALLOWED.includes(detectedMime)) {
    return { error: 'unsupported_mime' as const, name: file.name, mime: detectedMime || '(empty)' };
  }
  if (file.size > MAX_BYTES) {
    return { error: 'file_too_large' as const, name: file.name, bytes: file.size, max: MAX_BYTES };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buf = Buffer.from(await file.arrayBuffer()) as any;
  let outMime = detectedMime;
  if (HEIC_MIMES.has(detectedMime) || looksHeicByName) {
    try {
      buf = await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
      outMime = 'image/jpeg';
    } catch (e) {
      return { error: 'heic_decode_failed' as const, name: file.name, detail: String(e) };
    }
  }
  const key = keyFor('original', userId, extFromMime(outMime));
  const url = await uploadBuffer({ key, body: buf, contentType: outMime });
  const upload = await prisma.upload.create({
    data: { userId, fileUrl: url, fileType: outMime, bytes: buf.length, status: 'ready' },
  });
  return { upload };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const form = await req.formData();

  // Поддержка двух форматов: одиночный 'file' (back-compat) и массив 'files'.
  const files: File[] = [];
  const single = form.get('file');
  if (single instanceof File) files.push(single);
  for (const f of form.getAll('files')) if (f instanceof File) files.push(f);

  if (files.length === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: 'too_many_files', max: MAX_FILES_PER_REQUEST }, { status: 413 });
  }

  // Проверяем общий лимит — не больше 10 фото на юзера за всё время (можно перевыставить).
  const existing = await prisma.upload.count({ where: { userId: user.id, status: 'ready' } });
  if (existing + files.length > 10) {
    return NextResponse.json(
      { error: 'quota_exceeded', limit: 10, have: existing, requested: files.length },
      { status: 413 },
    );
  }

  const uploads: Array<{ id: string; url: string; type: string; bytes: number }> = [];
  const errors: unknown[] = [];

  for (const file of files) {
    const result = await storeOne(file, user.id);
    if ('error' in result) {
      errors.push(result);
      continue;
    }
    uploads.push({
      id: result.upload.id,
      url: result.upload.fileUrl,
      type: result.upload.fileType,
      bytes: result.upload.bytes,
    });
  }

  if (uploads.length === 0) {
    return NextResponse.json({ error: 'all_failed', errors }, { status: 400 });
  }

  // Back-compat: если был single 'file' — возвращаем shape как раньше.
  if (files.length === 1 && uploads.length === 1 && !form.has('files')) {
    return NextResponse.json(uploads[0]);
  }

  return NextResponse.json({ uploads, errors: errors.length > 0 ? errors : undefined });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const uploads = await prisma.upload.findMany({
    where: { userId: user.id, status: 'ready' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileUrl: true, fileType: true, bytes: true, createdAt: true },
    take: 20,
  });
  return NextResponse.json({
    uploads: uploads.map((u) => ({
      id: u.id,
      url: u.fileUrl,
      type: u.fileType,
      bytes: u.bytes,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}
