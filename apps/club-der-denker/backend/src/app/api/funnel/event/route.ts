import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { guardRate } from '@/lib/ratelimit';
import { z } from 'zod';

/**
 * POST /api/funnel/event
 * Anonymous funnel telemetry (spec 3.1). Records each step the guest takes,
 * including free answers (sent silently in the background) and the binary
 * A/B branch (step 4). Keyed by an anonymous device id until the email is
 * captured at step 5.
 */
const Body = z.object({
  deviceId: z.string().min(1),
  step: z.enum(['start', 'free_answer', 'case', 'branch_a', 'branch_b', 'email', 'purchase']),
  payload: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  const limited = guardRate(req, 'funnel', 60, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);

  const db = serviceClient();
  const { error } = await db.from('cdd_lead_events').insert({
    device_id: parsed.data.deviceId,
    step: parsed.data.step,
    payload: parsed.data.payload ?? {},
  });
  if (error) return fail(error.message, 500);

  return ok({ recorded: true });
}
