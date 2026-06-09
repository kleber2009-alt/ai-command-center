import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { hashPassword, issueToken } from '@/lib/auth';
import { guardRate } from '@/lib/ratelimit';
import { z } from 'zod';

/**
 * POST /api/auth/register
 * Account creation (spec 3.1 step 7). Only valid AFTER a confirmed course
 * purchase: converts the anonymous lead into a full user by setting a password.
 */
const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const limited = guardRate(req, 'register', 10, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('password must be >= 8 chars', 422);
  const { email, password } = parsed.data;
  const db = serviceClient();

  const { data: user } = await db
    .from('cdd_users')
    .select('id, status, password_hash')
    .eq('email', email)
    .maybeSingle();
  if (!user) return fail('no lead for this email', 404);
  if (user.password_hash) return fail('account already exists', 409);

  // Guard: only allow if a paid course_access purchase is active.
  const { data: purchase } = await db
    .from('cdd_purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('product', 'course_access')
    .eq('status', 'active')
    .maybeSingle();
  if (!purchase) return fail('purchase required before account creation', 402);

  await db
    .from('cdd_users')
    .update({ password_hash: hashPassword(password), status: 'active' })
    .eq('id', user.id);

  return ok({ token: issueToken(user.id), userId: user.id });
}
