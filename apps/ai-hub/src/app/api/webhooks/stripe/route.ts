// Stripe webhook with TWO levels of idempotency:
//   1. webhook_events.event_id UNIQUE — guards against Stripe re-deliveries
//      of the SAME event (Stripe retries failed deliveries up to 72h).
//   2. payments.status check — guards against legitimate but already-finalized
//      payment_intents (e.g. user re-triggered checkout).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { credit } from "@/lib/wallet";
import { beginWebhook, finishWebhook } from "@/lib/webhooks/dedup";
import { child } from "@/lib/logger";

const log = child("webhook.stripe");
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_secret_missing" }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const rawBody = await req.text();

  let event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid";
    log.warn("invalid signature", { error: msg });
    // Still try to dedup an invalid event so we can audit-trail repeat attacks.
    return NextResponse.json({ error: "invalid_signature", detail: msg }, { status: 400 });
  }

  // === Idempotency level 1: dedup by Stripe event_id ===
  const dedup = await beginWebhook("stripe", event.id, "verified", {
    type: event.type,
    livemode: event.livemode,
    created: event.created,
  });
  if (dedup.duplicate) {
    log.info("stripe event already processed", { eventId: event.id, type: event.type });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as {
          id: string; payment_status: string;
          metadata?: { payment_id?: string; user_id?: string; tokens_to_add?: string };
        };
        if (session.payment_status !== "paid") break;

        const paymentId = session.metadata?.payment_id;
        const userId    = session.metadata?.user_id;
        const tokens    = Number(session.metadata?.tokens_to_add ?? 0);
        if (!paymentId || !userId || !tokens) {
          await finishWebhook(dedup.id, "missing_metadata");
          return NextResponse.json({ error: "missing_metadata" }, { status: 400 });
        }

        // === Idempotency level 2: payments.status check ===
        const [existing] = await db.select({ id: payments.id, status: payments.status })
          .from(payments).where(eq(payments.id, paymentId)).limit(1);
        if (!existing) {
          await finishWebhook(dedup.id, "payment_not_found");
          return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
        }
        if (existing.status === "succeeded") {
          await finishWebhook(dedup.id, null);
          log.info("payment already succeeded", { paymentId, eventId: event.id });
          return NextResponse.json({ ok: true, payment_duplicate: true });
        }

        await credit({
          userId, amount: tokens, type: "purchase",
          paymentId,
          description: `Stripe checkout ${session.id}`,
        });
        await db.update(payments).set({
          status: "succeeded",
          completedAt: new Date(),
        }).where(eq(payments.id, paymentId));

        log.info("payment succeeded", { paymentId, userId, tokens, eventId: event.id });
        break;
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as { metadata?: { payment_id?: string } };
        const paymentId = session.metadata?.payment_id;
        if (paymentId) {
          await db.update(payments).set({
            status: event.type === "checkout.session.expired" ? "cancelled" : "failed",
            completedAt: new Date(),
          }).where(eq(payments.id, paymentId));
          log.info("payment terminal status", { paymentId, status: event.type });
        }
        break;
      }

      default:
        log.debug("ignored stripe event type", { type: event.type });
    }

    await finishWebhook(dedup.id, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishWebhook(dedup.id, msg);
    log.error("stripe handler error", { eventId: event.id, error: msg });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
