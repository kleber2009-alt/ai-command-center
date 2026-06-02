import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { applyValidatedReceipt } from '@/lib/engine/iap';

/**
 * POST /api/iap/apple
 * App Store Server Notifications V2 webhook (spec 4 "Проверка на бэкенде").
 * Logs the raw notification, verifies the signed payload (JWS), maps it to a
 * ValidatedReceipt, and applies access flags. Idempotent on transaction id.
 *
 * TODO(production): verify the JWS signature chain against Apple's root CA and
 * decode the transactionInfo / renewalInfo claims.
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  if (!raw) return fail('invalid payload', 422);

  const db = serviceClient();
  await db.from('cdd_iap_webhooks').insert({
    platform: 'apple',
    event_type: raw?.notificationType ?? null,
    signature_ok: false, // set true once JWS verification is implemented
    raw,
  });

  // --- Placeholder mapping; replace with verified JWS decode. ---
  const decoded = raw?.data?.signedTransactionInfo;
  if (!decoded?.appAccountToken || !decoded?.transactionId) {
    return ok({ received: true, applied: false });
  }

  await applyValidatedReceipt(db, {
    userId: decoded.appAccountToken, // App Store appAccountToken == our user id
    product: decoded.productId?.includes('subscription') ? 'community_subscription' : 'course_access',
    platform: 'apple',
    storeTransactionId: decoded.transactionId,
    originalTransactionId: decoded.originalTransactionId,
    receiptRef: decoded.transactionId,
    purchasedAt: new Date(Number(decoded.purchaseDate ?? Date.now())),
    expiresAt: decoded.expiresDate ? new Date(Number(decoded.expiresDate)) : undefined,
    status: 'active',
  });

  return ok({ received: true, applied: true });
}
