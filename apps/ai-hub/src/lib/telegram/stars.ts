// Telegram Stars (XTR) billing helpers.
//
// Flow:
//   1) Client clicks "Pay with Stars" → server creates pending `payments` row →
//      builds invoice link via Bot API createInvoiceLink. Payload contains
//      `payment_id` + HMAC over it so we can verify pre_checkout_query / successful_payment.
//   2) User opens t.me/$invoice link (or Telegram.WebApp.openInvoice in TMA) → pays.
//   3) Telegram sends pre_checkout_query → we verify payload and answer ok=true.
//   4) Telegram sends message.successful_payment → we wallet_credit + mark
//      payment row as succeeded.
//
// Docs: https://core.telegram.org/bots/payments-stars
//       https://core.telegram.org/bots/api#createinvoicelink

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.telegram.org";

function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

function payloadSecret(): string {
  // Reuse AUTH_SECRET as the HMAC key for invoice payloads — it's a long random
  // server-side secret already. Adding a dedicated env var would just be one
  // more thing to misplace.
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/** Build signed payload string. Format: `${paymentId}.${hmac8}`. */
export function signPayload(paymentId: string): string {
  const sig = createHmac("sha256", payloadSecret()).update(paymentId).digest("hex").slice(0, 16);
  return `${paymentId}.${sig}`;
}

/** Returns paymentId if signature is valid, null otherwise. */
export function verifyPayload(payload: string): string | null {
  const idx = payload.lastIndexOf(".");
  if (idx < 0) return null;
  const paymentId = payload.slice(0, idx);
  const givenSig = payload.slice(idx + 1);
  if (paymentId.length === 0 || givenSig.length !== 16) return null;
  const expectedSig = createHmac("sha256", payloadSecret()).update(paymentId).digest("hex").slice(0, 16);
  try {
    if (timingSafeEqual(Buffer.from(givenSig, "hex"), Buffer.from(expectedSig, "hex"))) {
      return paymentId;
    }
  } catch { /* length mismatch */ }
  return null;
}

interface CreateInvoiceArgs {
  paymentId: string;
  title: string;                                           // ≤ 32 chars
  description: string;                                     // ≤ 255 chars
  stars: number;                                           // integer ≥ 1
  photoUrl?: string;
}

/** Returns a t.me/$invoice_xxx link the user can open. */
export async function createInvoiceLink(args: CreateInvoiceArgs): Promise<string> {
  const body = {
    title: args.title.slice(0, 32),
    description: args.description.slice(0, 255),
    payload: signPayload(args.paymentId),
    provider_token: "",                                    // empty for digital goods / Stars
    currency: "XTR",
    prices: [{ label: args.title.slice(0, 32), amount: Math.max(1, Math.floor(args.stars)) }],
    photo_url: args.photoUrl,
    photo_width: args.photoUrl ? 512 : undefined,
    photo_height: args.photoUrl ? 512 : undefined,
  };

  const res = await fetch(`${BASE}/bot${botToken()}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !(data as { ok?: boolean }).ok) {
    throw new Error(`Telegram createInvoiceLink failed: ${(data as { description?: string }).description ?? res.status}`);
  }
  return (data as { result: string }).result;
}

/** Answer a pre_checkout_query — must respond within 10 seconds. */
export async function answerPreCheckoutQuery(args: {
  query_id: string; ok: boolean; error_message?: string;
}): Promise<void> {
  const res = await fetch(`${BASE}/bot${botToken()}/answerPreCheckoutQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`answerPreCheckoutQuery failed: ${(data as { description?: string }).description ?? res.status}`);
  }
}
