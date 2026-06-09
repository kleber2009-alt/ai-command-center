import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { applyValidatedReceipt, ValidatedReceipt } from '@/lib/engine/iap';
import { z } from 'zod';

/**
 * POST /api/iap/web
 * Web-fallback payment webhook (spec 4 "Web-Fallback") for external gateways
 * (card / crypto). Authenticated by an HMAC-SHA256 signature over the raw body
 * using WEB_GATEWAY_WEBHOOK_SECRET, sent in the `x-signature` header (hex).
 * No card data is processed or stored — only the reconciled access result.
 */
const Body = z.object({
  userId: z.string().uuid(),
  product: z.enum(['course_access', 'community_subscription']),
  status: z.enum(['pending', 'active', 'expired', 'refunded', 'revoked']),
  transactionId: z.string().min(1),
  purchasedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WEB_GATEWAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const db = serviceClient();

  const signatureOk = verifySignature(rawBody, req.headers.get('x-signature'));
  if (!signatureOk) {
    await logWebhook(db, undefined, false, rawBody);
    return fail('invalid signature', 401);
  }

  const parsed = Body.safeParse(JSON.parse(rawBody || '{}'));
  if (!parsed.success) {
    await logWebhook(db, 'invalid', true, rawBody);
    return fail('invalid body', 422);
  }

  const receipt: ValidatedReceipt = {
    userId: parsed.data.userId,
    product: parsed.data.product,
    platform: 'web',
    status: parsed.data.status,
    storeTransactionId: parsed.data.transactionId,
    receiptRef: parsed.data.transactionId,
    purchasedAt: parsed.data.purchasedAt ? new Date(parsed.data.purchasedAt) : new Date(),
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
  };
  await applyValidatedReceipt(db, receipt);

  await logWebhook(db, parsed.data.status, true, rawBody);
  return ok({ received: true, applied: true });
}

async function logWebhook(db: ReturnType<typeof serviceClient>, eventType: string | undefined, signatureOk: boolean, rawBody: string) {
  let raw: unknown = rawBody;
  try { raw = JSON.parse(rawBody); } catch { /* keep string */ }
  await db.from('cdd_iap_webhooks').insert({
    platform: 'web',
    event_type: eventType ?? null,
    signature_ok: signatureOk,
    raw: raw ?? {},
    processed_at: new Date().toISOString(),
  });
}
