import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/admin-auth';
import { ok, fail } from '@/lib/http';
import { z } from 'zod';

/**
 * Admin user management (spec 6): view status / purchase history / progress and
 * manually block / unblock.
 *
 *  GET   /api/admin/users?id=<uuid>   -> detail incl. purchases (id omitted -> list)
 *  PATCH /api/admin/users             -> block / unblock
 */
export async function GET(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const db = serviceClient();
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const { data: user, error } = await db
      .from('cdd_users')
      .select('id, email, status, level, items_completed, streak_days, joker_available, joker_used, community_access_until, created_at, cdd_purchases(product, platform, status, purchased_at, expires_at)')
      .eq('id', id)
      .single();
    if (error) return fail(error.message, 404);
    return ok({ user });
  }

  const { data, error } = await db
    .from('cdd_users')
    .select('id, email, status, level, items_completed, streak_days, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return fail(error.message, 500);
  return ok({ users: data ?? [] });
}

const Body = z.object({ userId: z.string().uuid(), action: z.enum(['block', 'unblock']) });

export async function PATCH(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);

  const db = serviceClient();
  // Unblock returns the user to 'active' (a blocked account always had a purchase/login).
  const status = parsed.data.action === 'block' ? 'blocked' : 'active';
  const { error } = await db.from('cdd_users').update({ status }).eq('id', parsed.data.userId);
  if (error) return fail(error.message, 500);
  return ok({ status });
}
