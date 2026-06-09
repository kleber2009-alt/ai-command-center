import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { applyValidatedReceipt, ValidatedReceipt } from '@/lib/engine/iap';
import { verifyAppleJws, appleTransactionToReceipt } from '@/lib/engine/iap-verify';
import { log } from '@/lib/logger';

/**
 * POST /api/iap/apple
 * App Store Server Notifications V2 (spec 4). Body: { signedPayload } — a JWS
 * signed by Apple. We verify it, then verify the nested signedTransactionInfo
 * JWS, derive the user from appAccountToken, and apply the validated receipt.
 * Idempotent: applyValidatedReceipt upserts on (platform, transactionId).
 */
function statusFromNotification(type: string | undefined): ValidatedReceipt['status'] | undefined {
  switch (type) {
    case 'REFUND': return 'refunded';
    case 'REVOKE': return 'revoked';
    case 'EXPIRED': return 'expired';
    default: return undefined;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const db = serviceClient();

  let signatureOk = false;
  let applied = false;
  try {
    if (!raw?.signedPayload) return fail('missing signedPayload', 422);

    const notification = await verifyAppleJws(raw.signedPayload);
    signatureOk = true;

    const txJws = notification.data?.signedTransactionInfo;
    if (txJws) {
      const tx = await verifyAppleJws(txJws);
      const userId = tx.appAccountToken;
      if (userId) {
        const receipt = appleTransactionToReceipt(userId, tx, statusFromNotification(notification.notificationType));
        await applyValidatedReceipt(db, receipt);
        applied = true;
      }
    }

    await logWebhook(db, notification.notificationType, signatureOk, raw);
    return ok({ received: true, applied });
  } catch (e: any) {
    log.error('apple webhook failed', { signatureOk, err: e.message });
    await logWebhook(db, raw?.notificationType, signatureOk, raw);
    return fail(`apple webhook: ${e.message}`, 400);
  }
}

async function logWebhook(db: ReturnType<typeof serviceClient>, eventType: string | undefined, signatureOk: boolean, raw: unknown) {
  await db.from('cdd_iap_webhooks').insert({
    platform: 'apple',
    event_type: eventType ?? null,
    signature_ok: signatureOk,
    raw: raw ?? {},
    processed_at: new Date().toISOString(),
  });
}
