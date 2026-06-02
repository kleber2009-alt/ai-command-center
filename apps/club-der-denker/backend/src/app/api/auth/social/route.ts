import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { issueToken } from '@/lib/auth';
import { verifySocialToken } from '@/lib/social-auth';
import { z } from 'zod';

/**
 * POST /api/auth/social
 * Social sign-in (spec 3.2): exchanges a verified Apple/Google identity token
 * for an app session. Resolution order:
 *   1. existing user by provider subject (apple_sub / google_sub) -> sign in
 *   2. existing user by email -> link the provider subject -> sign in
 *   3. otherwise create a new lead with the provider subject -> sign in
 */
const Body = z.object({
  provider: z.enum(['apple', 'google']),
  identityToken: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);

  let identity;
  try {
    identity = await verifySocialToken(parsed.data.provider, parsed.data.identityToken);
  } catch (e: any) {
    return fail(`token verification failed: ${e.message}`, 401);
  }

  const db = serviceClient();
  const subCol = identity.provider === 'apple' ? 'apple_sub' : 'google_sub';

  // 1. By provider subject.
  const { data: bySub } = await db
    .from('cdd_users')
    .select('id, status')
    .eq(subCol, identity.sub)
    .is('deleted_at', null)
    .maybeSingle();
  if (bySub) {
    if (bySub.status === 'blocked') return fail('account blocked', 403);
    return ok({ token: issueToken(bySub.id), userId: bySub.id });
  }

  // Apple returns the email only on first consent; without it we can't link/create.
  if (!identity.email) return fail('email not provided by provider', 422);

  // 2. By email -> link the subject.
  const { data: byEmail } = await db
    .from('cdd_users')
    .select('id, status')
    .eq('email', identity.email)
    .is('deleted_at', null)
    .maybeSingle();
  if (byEmail) {
    if (byEmail.status === 'blocked') return fail('account blocked', 403);
    await db.from('cdd_users').update({ [subCol]: identity.sub }).eq('id', byEmail.id);
    return ok({ token: issueToken(byEmail.id), userId: byEmail.id });
  }

  // 3. Create a new lead. Course/community access still requires a purchase.
  const { data: created, error } = await db
    .from('cdd_users')
    .insert({ email: identity.email, status: 'lead', [subCol]: identity.sub })
    .select('id')
    .single();
  if (error) return fail(error.message, 500);

  return ok({ token: issueToken(created.id), userId: created.id, created: true });
}
