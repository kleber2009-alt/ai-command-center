import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { normalizeLocale } from '@/lib/i18n';
import { ok, fail } from '@/lib/http';
import { guardRate } from '@/lib/ratelimit';
import { z } from 'zod';

/**
 * POST /api/leads
 * Email capture (spec 3.1 step 5). Happens AFTER choosing branch B but
 * strictly BEFORE any price/payment page. A single email field, no password.
 * Immediately persists the lead. Idempotent on email.
 */
const Body = z.object({
  email: z.string().email(),
  deviceId: z.string().optional(),
  locale: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const limited = guardRate(req, 'leads', 10, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid email', 422);

  const { email, deviceId } = parsed.data;
  const locale = normalizeLocale(parsed.data.locale);
  const db = serviceClient();

  // Upsert lead: create as status 'lead' if new, leave existing users untouched.
  const { data: existing } = await db
    .from('cdd_users')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();

  let userId = existing?.id as string | undefined;
  if (!userId) {
    const { data, error } = await db
      .from('cdd_users')
      .insert({ email, status: 'lead', locale })
      .select('id')
      .single();
    if (error) return fail(error.message, 500);
    userId = data.id;
  }

  if (deviceId) {
    await db.from('cdd_lead_events').insert({
      user_id: userId,
      device_id: deviceId,
      step: 'email',
      payload: { email },
    });
  }

  return ok({ userId, status: existing?.status ?? 'lead' });
}
