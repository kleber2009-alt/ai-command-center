import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { applyValidatedReceipt } from '@/lib/engine/iap';
import { verifyGooglePubSubJwt, verifyGooglePurchase } from '@/lib/engine/iap-verify';

/**
 * POST /api/iap/google
 * Google Play Real-time Developer Notifications via Pub/Sub push (spec 4).
 * Authenticated by the Google-signed OIDC token in the Authorization header.
 * The base64 message.data carries the notification; we then validate the
 * purchase against the Play Developer API and apply the result. The user is
 * resolved from the obfuscated external account id set at purchase time.
 */
export async function POST(req: NextRequest) {
  const db = serviceClient();

  let signatureOk = false;
  let eventType: string | undefined;
  let raw: any = null;

  try {
    await verifyGooglePubSubJwt(req.headers.get('authorization'));
    signatureOk = true;

    raw = await req.json().catch(() => null);
    const dataB64 = raw?.message?.data;
    if (!dataB64) {
      await logWebhook(db, undefined, signatureOk, raw);
      return ok({ received: true, applied: false });
    }

    const notification = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
    let applied = false;

    if (notification.subscriptionNotification) {
      const n = notification.subscriptionNotification;
      eventType = `subscription:${n.notificationType}`;
      const receipt = await verifyGooglePurchase(undefined, n.subscriptionId ?? '', n.purchaseToken, true);
      await applyValidatedReceipt(db, receipt);
      applied = true;
    } else if (notification.oneTimeProductNotification) {
      const n = notification.oneTimeProductNotification;
      eventType = `product:${n.notificationType}`;
      const receipt = await verifyGooglePurchase(undefined, n.sku ?? '', n.purchaseToken, false);
      await applyValidatedReceipt(db, receipt);
      applied = true;
    } else {
      eventType = 'test'; // testNotification or unknown
    }

    await logWebhook(db, eventType, signatureOk, raw);
    return ok({ received: true, applied });
  } catch (e: any) {
    await logWebhook(db, eventType, signatureOk, raw);
    // 401 for auth failures so Pub/Sub retries; 400 otherwise.
    return fail(`google webhook: ${e.message}`, signatureOk ? 400 : 401);
  }
}

async function logWebhook(db: ReturnType<typeof serviceClient>, eventType: string | undefined, signatureOk: boolean, raw: unknown) {
  await db.from('cdd_iap_webhooks').insert({
    platform: 'google',
    event_type: eventType ?? null,
    signature_ok: signatureOk,
    raw: raw ?? {},
    processed_at: new Date().toISOString(),
  });
}
