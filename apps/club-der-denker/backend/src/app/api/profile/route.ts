import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { isLocale } from '@/lib/i18n';
import { progressFraction, currentDayIndex } from '@/lib/engine/levels';

/**
 * GET /api/profile  — dashboard data (spec 3.2): name, email, level badge,
 *                     activity, joker status, community window.
 * PATCH /api/profile — change locale (instant, app-wide).
 * DELETE /api/profile — GDPR account deletion (spec 3.2 / 5).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return fail('unauthorized', 401);
  const db = serviceClient();

  const { data: u } = await db
    .from('cdd_users')
    .select('id, email, display_name, locale, status, items_completed, level, streak_days, joker_available, joker_used, community_access_until')
    .eq('id', auth.userId)
    .is('deleted_at', null)
    .single();
  if (!u) return fail('user not found', 404);

  return ok({
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    locale: u.locale,
    status: u.status,
    itemsCompleted: u.items_completed,
    level: u.level,
    progress: progressFraction(u.items_completed),
    currentDay: currentDayIndex(u.items_completed),
    streakDays: u.streak_days,
    jokerAvailable: u.joker_available,
    jokerUsed: u.joker_used,
    communityAccessUntil: u.community_access_until,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return fail('unauthorized', 401);
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();

  const update: Record<string, unknown> = {};
  if (typeof body.locale === 'string' && isLocale(body.locale)) update.locale = body.locale;
  if (typeof body.displayName === 'string') update.display_name = body.displayName.slice(0, 80);
  if (Object.keys(update).length === 0) return fail('nothing to update', 422);

  await db.from('cdd_users').update(update).eq('id', auth.userId);
  return ok({ updated: Object.keys(update) });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return fail('unauthorized', 401);
  const db = serviceClient();

  // GDPR: soft-delete + scrub PII. Progress rows cascade on hard purge job.
  await db
    .from('cdd_users')
    .update({
      deleted_at: new Date().toISOString(),
      status: 'blocked',
      email: `deleted+${auth.userId}@cdd.invalid`,
      password_hash: null,
      display_name: null,
      google_sub: null,
      apple_sub: null,
    })
    .eq('id', auth.userId);

  return ok({ deleted: true });
}
