import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { normalizeLocale } from '@/lib/i18n';
import { ok, fail } from '@/lib/http';
import { evaluateUnlock } from '@/lib/engine/unlock';
import { currentDayIndex, itemsDoneToday, ITEMS_PER_DAY } from '@/lib/engine/levels';
import { requireUser } from '@/lib/auth';

/**
 * GET /api/course/today?tz=Europe/Berlin&locale=de
 * Returns the user's current pack of up to 4 items, gated by the timezone
 * unlock engine (spec 3.3). The pack is cacheable offline by the client.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return fail('unauthorized', 401);

  const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
  const locale = normalizeLocale(req.nextUrl.searchParams.get('locale'));
  const db = serviceClient();

  const { data: user, error: uErr } = await db
    .from('cdd_users')
    .select('items_completed')
    .eq('id', auth.userId)
    .single();
  if (uErr || !user) return fail('user not found', 404);

  // Find the local day of the most recent completion.
  const { data: last } = await db
    .from('cdd_progress')
    .select('local_day')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const unlock = evaluateUnlock({
    itemsCompleted: user.items_completed,
    lastCompletionDay: last?.local_day ?? null,
    timeZone: tz,
  });

  const dayIndex = currentDayIndex(user.items_completed);
  const startSlot = itemsDoneToday(user.items_completed) + 1; // next slot 1..4

  if (!unlock.unlocked) {
    return ok({ locked: true, dayIndex, doneToday: itemsDoneToday(user.items_completed), nextUnlock: 'local_midnight' });
  }

  // Fetch the remaining items of the current day.
  const { data: items, error } = await db
    .from('cdd_items')
    .select('id, kind, global_order, day_index, day_slot, media_kind, media_url, cdd_item_translations(body, options, locale)')
    .eq('kind', 'course')
    .eq('day_index', dayIndex)
    .gte('day_slot', startSlot)
    .order('day_slot', { ascending: true });
  if (error) return fail(error.message, 500);

  const view = (items ?? []).map((row: any) => {
    const tr = row.cdd_item_translations?.find((t: any) => t.locale === locale)
      ?? row.cdd_item_translations?.[0];
    return {
      id: row.id,
      kind: row.kind,
      globalOrder: row.global_order,
      dayIndex: row.day_index,
      daySlot: row.day_slot,
      mediaKind: row.media_kind,
      mediaUrl: row.media_url,
      body: tr?.body ?? '',
      options: tr?.options ?? [],
    };
  });

  return ok({ locked: false, dayIndex, perDay: ITEMS_PER_DAY, items: view });
}
