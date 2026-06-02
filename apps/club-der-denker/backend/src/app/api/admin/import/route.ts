import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/admin-auth';
import { ok, fail } from '@/lib/http';
import { isLocale } from '@/lib/i18n';
import { log } from '@/lib/logger';
import { z } from 'zod';

/**
 * POST /api/admin/import  (Stage 5 — bulk content)
 * Imports course/free/case content + translations in one shot (admin only).
 * Body: { items: ImportRow[] }. Idempotent: items are matched by (kind,
 * globalOrder) — case by kind — created if missing, then the per-locale
 * translation (and optional media) is upserted.
 *
 * The admin UI parses an uploaded CSV/JSON into this shape client-side.
 */
const Option = z.object({ key: z.string().min(1), label: z.string(), feedback: z.string() });
const Row = z.object({
  kind: z.enum(['course', 'free', 'case']),
  globalOrder: z.number().int().positive().optional(),
  locale: z.string(),
  body: z.string(),
  options: z.array(Option).max(4).optional(),
  mediaKind: z.enum(['text', 'image', 'video']).optional(),
  mediaUrl: z.string().url().nullable().optional(),
});
const Body = z.object({ items: z.array(Row).min(1).max(2000) });

export async function POST(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid import payload', 422);

  const db = serviceClient();
  let items = 0;
  let translations = 0;
  const errors: string[] = [];

  for (const row of parsed.data.items) {
    if (!isLocale(row.locale)) {
      errors.push(`unsupported locale: ${row.locale}`);
      continue;
    }
    if (row.kind !== 'case' && !row.globalOrder) {
      errors.push(`${row.kind} row missing globalOrder`);
      continue;
    }

    // Resolve or create the item.
    let q = db.from('cdd_items').select('id').eq('kind', row.kind);
    q = row.kind === 'case' ? q : q.eq('global_order', row.globalOrder!);
    const { data: existing } = await q.maybeSingle();

    let itemId = existing?.id as string | undefined;
    if (!itemId) {
      const insert: Record<string, unknown> = { kind: row.kind, media_kind: row.mediaKind ?? 'text' };
      if (row.kind === 'course') {
        insert.global_order = row.globalOrder;
        insert.day_index = Math.floor((row.globalOrder! - 1) / 4) + 1;
        insert.day_slot = ((row.globalOrder! - 1) % 4) + 1;
      } else if (row.kind === 'free') {
        insert.global_order = row.globalOrder;
      }
      const { data: created, error } = await db.from('cdd_items').insert(insert).select('id').single();
      if (error) {
        errors.push(`create ${row.kind} #${row.globalOrder ?? ''}: ${error.message}`);
        continue;
      }
      itemId = created.id;
      items++;
    } else if (row.mediaUrl !== undefined || row.mediaKind) {
      await db.from('cdd_items').update({
        media_kind: row.mediaKind ?? 'text',
        media_url: row.mediaUrl ?? null,
      }).eq('id', itemId);
    }

    const { error: tErr } = await db.from('cdd_item_translations').upsert(
      { item_id: itemId, locale: row.locale, body: row.body, options: row.options ?? [] },
      { onConflict: 'item_id,locale' },
    );
    if (tErr) errors.push(`translation ${row.kind} ${row.locale}: ${tErr.message}`);
    else translations++;
  }

  log.info('content import', { items, translations, errors: errors.length });
  return ok({ itemsCreated: items, translationsUpserted: translations, errors });
}
