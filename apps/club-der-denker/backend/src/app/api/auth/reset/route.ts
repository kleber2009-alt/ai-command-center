import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { hashPassword, verifyPassword, issueToken } from '@/lib/auth';
import { guardRate } from '@/lib/ratelimit';
import { z } from 'zod';

/**
 * POST /api/auth/reset
 * Completes a password reset with the emailed code. Verifies the latest unused,
 * unexpired code for the account, sets the new password and issues a session.
 */
const Body = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const limited = guardRate(req, 'reset', 10, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);
  const db = serviceClient();

  const { data: user } = await db
    .from('cdd_users')
    .select('id, status')
    .eq('email', parsed.data.email)
    .is('deleted_at', null)
    .maybeSingle();
  if (!user) return fail('invalid code', 400);

  const { data: reset } = await db
    .from('cdd_password_resets')
    .select('id, code_hash, expires_at, used_at')
    .eq('user_id', user.id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!reset || !verifyPassword(parsed.data.code, reset.code_hash)) {
    return fail('invalid or expired code', 400);
  }

  await db
    .from('cdd_users')
    .update({ password_hash: hashPassword(parsed.data.password), status: user.status === 'blocked' ? 'blocked' : 'active' })
    .eq('id', user.id);
  await db.from('cdd_password_resets').update({ used_at: new Date().toISOString() }).eq('id', reset.id);

  if (user.status === 'blocked') return fail('account blocked', 403);
  return ok({ token: issueToken(user.id), userId: user.id });
}
