import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';

/**
 * POST /api/iap/google
 * Google Play Real-time Developer Notifications (Pub/Sub push) webhook
 * (spec 4). Logs the raw message; the base64 `data` payload must be decoded
 * and the purchase/subscription validated via the Play Developer API before
 * flags are flipped.
 *
 * TODO(production): verify the Pub/Sub JWT, decode message.data, then call
 * purchases.products.get / purchases.subscriptionsv2.get and map to a
 * ValidatedReceipt via applyValidatedReceipt().
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  if (!raw) return fail('invalid payload', 422);

  const db = serviceClient();
  await db.from('cdd_iap_webhooks').insert({
    platform: 'google',
    event_type: raw?.message?.attributes?.eventType ?? null,
    signature_ok: false,
    raw,
  });

  return ok({ received: true, applied: false });
}
