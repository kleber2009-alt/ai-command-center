import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { evaluateUnlock, localDay } from '@/lib/engine/unlock';
import { levelForProgress } from '@/lib/engine/levels';
import { registerActivity } from '@/lib/engine/streak';
import { z } from 'zod';

/**
 * POST /api/course/answer
 * Records a course-item answer (spec 3.3). Re-checks the unlock gate on the
 * server, appends progress, recomputes items_completed -> level, and updates
 * the streak. Correctness never affects level or unlock.
 */
const Body = z.object({
  itemId: z.string().uuid(),
  selectedKey: z.string().min(1),
  tz: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return fail('unauthorized', 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);
  const { itemId, selectedKey, tz } = parsed.data;
  const db = serviceClient();

  const { data: user } = await db
    .from('cdd_users')
    .select('items_completed, streak_days, joker_available, joker_used, last_active_day')
    .eq('id', auth.userId)
    .single();
  if (!user) return fail('user not found', 404);

  // Server-side unlock re-check to prevent client-side bypass.
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
  if (!unlock.unlocked) return fail('locked until local midnight', 423, 'LOCKED');

  // Validate the item + grade the answer (feedback shown client-side).
  const { data: item } = await db
    .from('cdd_items')
    .select('id, cdd_item_translations(options, locale)')
    .eq('id', itemId)
    .single();
  if (!item) return fail('item not found', 404);

  const today = localDay(new Date(), tz);

  // Idempotent insert; unique(user_id,item_id) guards double-submits.
  const { error: pErr } = await db.from('cdd_progress').insert({
    user_id: auth.userId,
    item_id: itemId,
    selected_key: selectedKey,
    local_day: today,
    local_tz: tz,
  });
  if (pErr && !pErr.message.includes('duplicate')) return fail(pErr.message, 500);

  const itemsCompleted = user.items_completed + (pErr ? 0 : 1);
  const level = levelForProgress(itemsCompleted, true);

  const streak = registerActivity(
    {
      streakDays: user.streak_days,
      jokerAvailable: user.joker_available,
      jokerUsed: user.joker_used,
      lastActiveDay: user.last_active_day,
    },
    today,
  );

  await db
    .from('cdd_users')
    .update({
      items_completed: itemsCompleted,
      level,
      streak_days: streak.streakDays,
      joker_available: streak.jokerAvailable,
      joker_used: streak.jokerUsed,
      last_active_day: today,
    })
    .eq('id', auth.userId);

  return ok({ itemsCompleted, level, streakDays: streak.streakDays });
}
