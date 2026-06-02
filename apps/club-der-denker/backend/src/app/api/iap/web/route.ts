import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';

/**
 * POST /api/iap/web
 * Web-fallback payment webhook (spec 4 "Дополнительные интерфейсы / Web-
 * Fallback"). Generic endpoint for external gateways (card / crypto) so the
 * backend can reconcile payments via external webhooks. Verify the gateway's
 * HMAC signature before applying. No card data is ever stored.
 *
 * TODO(production): verify provider signature header, then map to a
 * ValidatedReceipt via applyValidatedReceipt().
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  if (!raw) return fail('invalid payload', 422);

  const db = serviceClient();
  await db.from('cdd_iap_webhooks').insert({
    platform: 'web',
    event_type: raw?.type ?? null,
    signature_ok: false,
    raw,
  });

  return ok({ received: true, applied: false });
}
