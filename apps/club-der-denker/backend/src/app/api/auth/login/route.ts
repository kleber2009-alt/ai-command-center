import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { verifyPassword, issueToken } from '@/lib/auth';
import { guardRate } from '@/lib/ratelimit';
import { z } from 'zod';

/**
 * POST /api/auth/login
 * Standard email + password authentication (spec 3.2). Social auth
 * (Google / Apple Sign-In) is handled by dedicated provider routes.
 */
const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const limited = guardRate(req, 'login', 10, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid credentials', 422);
  const { email, password } = parsed.data;
  const db = serviceClient();

  const { data: user } = await db
    .from('cdd_users')
    .select('id, password_hash, status')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle();

  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return fail('invalid email or password', 401);
  }
  if (user.status === 'blocked') return fail('account blocked', 403);

  return ok({ token: issueToken(user.id), userId: user.id });
}
