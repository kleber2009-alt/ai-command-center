import { NextRequest } from 'next/server';
import { adminGuard } from '@/lib/admin-auth';
import { ok, fail } from '@/lib/http';
import { uploadMedia } from '@/lib/storage';

/**
 * POST /api/admin/upload  (multipart/form-data)
 * Admin media upload (spec 6). Fields: `file` (the asset), optional `prefix`
 * ('items' | 'posts'). Returns the public URL + derived media kind to store on
 * the item / post.
 */
export const runtime = 'nodejs';
// Allow reasonably large video uploads.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File)) return fail('file required', 422);

  const prefix = (form.get('prefix') as string) === 'posts' ? 'posts' : 'items';

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { url, mediaKind } = await uploadMedia(buf, file.type, prefix);
    return ok({ url, mediaKind });
  } catch (e: any) {
    return fail(e.message, 400);
  }
}
