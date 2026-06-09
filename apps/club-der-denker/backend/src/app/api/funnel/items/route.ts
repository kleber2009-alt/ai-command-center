import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { normalizeLocale } from '@/lib/i18n';
import { ok, fail } from '@/lib/http';

/**
 * GET /api/funnel/items?locale=de
 * Returns the 3 anonymous free items + the practical case (spec 3.1, steps 2-3).
 * No auth required — this is the anonymous freemium entry point.
 */
export async function GET(req: NextRequest) {
  const locale = normalizeLocale(req.nextUrl.searchParams.get('locale'));
  const db = serviceClient();

  const { data, error } = await db
    .from('cdd_items')
    .select('id, kind, global_order, media_kind, media_url, cdd_item_translations(body, options, locale)')
    .in('kind', ['free', 'case'])
    .order('global_order', { ascending: true, nullsFirst: false });

  if (error) return fail(error.message, 500);

  const items = (data ?? []).map((row: any) => {
    const tr = row.cdd_item_translations?.find((t: any) => t.locale === locale)
      ?? row.cdd_item_translations?.[0];
    return {
      id: row.id,
      kind: row.kind,
      globalOrder: row.global_order,
      mediaKind: row.media_kind,
      mediaUrl: row.media_url,
      body: tr?.body ?? '',
      options: tr?.options ?? [],
    };
  });

  return ok({ items, locale });
}
