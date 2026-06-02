import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { localDay } from '@/lib/engine/unlock';
import { applyInactivitySweep } from '@/lib/engine/streak';

/**
 * POST /api/cron/inactivity-sweep
 * Daily streak/joker maintenance (spec 3.3). Intended to run hourly: for each
 * active user it computes — in the user's own time zone — how many full
 * calendar days passed without activity, then applies the joker/streak rules.
 * Running hourly lets it fire near each user's local midnight regardless of tz.
 *
 * Idempotency: when the joker absorbs the gap, last_active_day advances to the
 * covered day so the joker is spent exactly once; a reset sets streak 0 (a
 * no-op on re-run). Guarded by the CRON_SECRET bearer token.
 *
 * NOTE: streak/joker only — course progress (items_completed) is never touched.
 */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
}

function minusOneDay(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!expected || auth !== `Bearer ${expected}`) return fail('unauthorized', 401);

  const db = serviceClient();
  const now = new Date();

  // Active users with an open streak that could be at risk.
  const { data: users, error } = await db
    .from('cdd_users')
    .select('id, streak_days, joker_available, joker_used, last_active_day, last_tz')
    .eq('status', 'active')
    .gt('streak_days', 0)
    .not('last_active_day', 'is', null);
  if (error) return fail(error.message, 500);

  let jokersConsumed = 0;
  let streaksReset = 0;

  for (const u of users ?? []) {
    const today = localDay(now, u.last_tz || 'UTC');
    const skipped = Math.max(0, dayDiff(u.last_active_day as string, today) - 1);
    if (skipped < 1) continue;

    const t = applyInactivitySweep(
      {
        streakDays: u.streak_days,
        jokerAvailable: u.joker_available,
        jokerUsed: u.joker_used,
        lastActiveDay: u.last_active_day as string,
      },
      skipped,
    );

    if (t.jokerConsumedNow) jokersConsumed++;
    if (t.streakResetNow) streaksReset++;

    await db
      .from('cdd_users')
      .update({
        streak_days: t.streakDays,
        joker_available: t.jokerAvailable,
        joker_used: t.jokerUsed,
        // Joker covered the gap -> mark yesterday as "active" so it's spent once.
        // Reset -> stop reprocessing by advancing to today.
        last_active_day: t.jokerConsumedNow ? minusOneDay(today) : today,
      })
      .eq('id', u.id);
  }

  return ok({ scanned: users?.length ?? 0, jokersConsumed, streaksReset });
}
