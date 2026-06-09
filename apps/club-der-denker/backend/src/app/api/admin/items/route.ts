import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/admin-auth';
import { ok, fail } from '@/lib/http';
import { isLocale } from '@/lib/i18n';
import { z } from 'zod';

/**
 * Admin course-content CRUD (spec 6): fill / update / translate all 112 course
 * items + 3 free items + the case, per locale.
 *
 *  GET   /api/admin/items?kind=course   -> items + their translations
 *  PUT   /api/admin/items               -> upsert a translation (body + options)
 *  POST  /api/admin/items               -> update media for an item
 */
export async function GET(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const kind = req.nextUrl.searchParams.get('kind') ?? 'course';
  const db = serviceClient();
  const { data, error } = await db
    .from('cdd_items')
    .select('id, kind, global_order, day_index, day_slot, media_kind, media_url, cdd_item_translations(locale, body, options)')
    .eq('kind', kind)
    .order('global_order', { ascending: true, nullsFirst: true });
  if (error) return fail(error.message, 500);
  return ok({ items: data ?? [] });
}

const Option = z.object({ key: z.string().min(1), label: z.string(), feedback: z.string() });
const TranslationBody = z.object({
  itemId: z.string().uuid(),
  locale: z.string(),
  body: z.string(),
  options: z.array(Option).max(4).optional(),
});

export async function PUT(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const parsed = TranslationBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);
  if (!isLocale(parsed.data.locale)) return fail('unsupported locale', 422);

  const db = serviceClient();
  const { error } = await db.from('cdd_item_translations').upsert(
    {
      item_id: parsed.data.itemId,
      locale: parsed.data.locale,
      body: parsed.data.body,
      options: parsed.data.options ?? [],
    },
    { onConflict: 'item_id,locale' },
  );
  if (error) return fail(error.message, 500);
  return ok({ saved: true });
}

const MediaBody = z.object({
  itemId: z.string().uuid(),
  mediaKind: z.enum(['text', 'image', 'video']),
  mediaUrl: z.string().url().nullable(),
});

export async function POST(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const parsed = MediaBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);

  const db = serviceClient();
  const { error } = await db
    .from('cdd_items')
    .update({ media_kind: parsed.data.mediaKind, media_url: parsed.data.mediaUrl })
    .eq('id', parsed.data.itemId);
  if (error) return fail(error.message, 500);
  return ok({ saved: true });
}
