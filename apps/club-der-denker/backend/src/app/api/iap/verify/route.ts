import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { applyValidatedReceipt } from '@/lib/engine/iap';
import { verifyAppleTransaction, verifyGooglePurchase } from '@/lib/engine/iap-verify';
import { z } from 'zod';

/**
 * POST /api/iap/verify
 * Client-initiated receipt validation (spec 4). Called right after a native
 * purchase (react-native-iap) to validate the receipt server-side and flip
 * access flags immediately, without waiting for the async store webhook.
 * Authenticated: the user id comes from the session, not the client payload.
 *
 *  Apple:  { platform: 'apple',  jws }                       (StoreKit2 JWS)
 *  Google: { platform: 'google', productId, purchaseToken, isSubscription }
 */
const Body = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('apple'), jws: z.string().min(1) }),
  z.object({
    platform: z.literal('google'),
    productId: z.string().min(1),
    purchaseToken: z.string().min(1),
    isSubscription: z.boolean().default(false),
  }),
]);

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok || !auth.userId) return fail('unauthorized', 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);

  try {
    const receipt = parsed.data.platform === 'apple'
      ? await verifyAppleTransaction(auth.userId, parsed.data.jws)
      : await verifyGooglePurchase(auth.userId, parsed.data.productId, parsed.data.purchaseToken, parsed.data.isSubscription);

    const db = serviceClient();
    await applyValidatedReceipt(db, receipt);

    return ok({ product: receipt.product, status: receipt.status, expiresAt: receipt.expiresAt ?? null });
  } catch (e: any) {
    return fail(`verification failed: ${e.message}`, 402);
  }
}
