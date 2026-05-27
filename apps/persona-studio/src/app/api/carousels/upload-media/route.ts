// POST /api/carousels/upload-media — лёгкий upload медиа для слайдов
// карусели. В отличие от /api/upload (который под аватарами, лимитирован
// 10 файлами на юзера и создаёт Upload entity), здесь только S3 upload +
// возврат URL. Слайды могут содержать неограниченное кол-во mockup'ов.
//
// Принимает одно поле 'file' (FormData). Возвращает { url, contentType, bytes }.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { extFromMime, keyFor, uploadBuffer } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — мокапы обычно мелкие скриншоты
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'bad_form' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }

  const mime = file.type || 'image/jpeg';
  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { error: 'unsupported_mime', mime, allowed: Array.from(ALLOWED) },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'file_too_large', bytes: file.size, max: MAX_BYTES },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // Кладём в namespace 'cover' (используется как S3 prefix для slide media).
  // keyFor('cover', ...) создаёт уникальный путь с nanoid, повторов не будет.
  const key = keyFor('cover', user.id, extFromMime(mime));
  const url = await uploadBuffer({ key, body: buf, contentType: mime });

  return NextResponse.json({
    ok: true,
    url,
    contentType: mime,
    bytes: buf.length,
  });
}
