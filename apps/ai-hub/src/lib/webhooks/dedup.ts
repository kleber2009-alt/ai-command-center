// Webhook idempotency helper. Uses webhook_events table as canonical dedup store.
//
// Pattern:
//   const dedup = await beginWebhook("stripe", event.id, "verified", payload);
//   if (dedup.duplicate) return { ok: true, duplicate: true };  // ack and exit
//   try {
//     ... side effects (wallet_credit etc.) ...
//     await finishWebhook(dedup.id, null);
//   } catch (err) {
//     await finishWebhook(dedup.id, err.message);
//     throw err;
//   }
//
// Race-free: INSERT with UNIQUE(provider, event_id) atomically claims the event.
// If two replicas receive the same delivery at the same instant, exactly one
// gets duplicate=false and runs the side-effect.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { child } from "@/lib/logger";

const log = child("webhook.dedup");

export type SignatureStatus = "verified" | "invalid" | "missing";

export interface DedupResult {
  /** Our internal id of the webhook_events row. */
  id: string;
  /** True if this provider+event_id was already recorded — caller should ack and skip. */
  duplicate: boolean;
}

export async function beginWebhook(
  provider: string,
  eventId: string,
  signatureStatus: SignatureStatus,
  payloadSummary?: Record<string, unknown> | null,
): Promise<DedupResult> {
  try {
    const [row] = await db.insert(webhookEvents).values({
      provider, eventId, signatureStatus,
      payloadSummary: payloadSummary ?? null,
    }).returning({ id: webhookEvents.id });

    log.debug("webhook claimed", { provider, eventId, id: row.id });
    return { id: row.id, duplicate: false };
  } catch (err) {
    // Unique violation → already processed (or in-flight from another worker).
    if (err instanceof Error && /duplicate key/i.test(err.message)) {
      const [existing] = await db.select({ id: webhookEvents.id })
        .from(webhookEvents)
        .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)))
        .limit(1);
      log.info("webhook duplicate ack", { provider, eventId, id: existing?.id });
      return { id: existing?.id ?? "", duplicate: true };
    }
    throw err;
  }
}

export async function finishWebhook(id: string, error: string | null) {
  if (!id) return;
  await db.update(webhookEvents).set({
    processedAt: new Date(),
    processingError: error,
  }).where(eq(webhookEvents.id, id));
}
