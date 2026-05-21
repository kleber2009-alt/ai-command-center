// Poller: actively polls provider status for jobs stuck in queued/processing.
// Safety net when webhook delivery fails (lost packets, signature mismatch,
// secret rotation, provider outage). Mirrors the webhook handler's terminal
// transitions (charge/refund + ingest) so the outcome is identical regardless
// of which path delivers the final status.
//
// Race vs webhook handler is benign: both go through wallet_charge/wallet_refund
// which atomically check the reservation; the second caller fails with
// "reservation not found" and we swallow it after re-reading status as terminal.

import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";
import { getAdapter } from "@/lib/providers/router";
import { charge, refund } from "@/lib/wallet";
import { ingestJobMedia } from "@/lib/jobs/ingest";
import { child } from "@/lib/logger";
import type { ProviderId } from "@/lib/db/schema";

const log = child("poller");
const TICK_SEC       = Number(process.env.POLLER_TICK_SEC ?? "30");
const POLL_AFTER_SEC = Number(process.env.POLLER_AFTER_SEC ?? "30");
const BATCH_LIMIT    = Number(process.env.POLLER_BATCH ?? "20");

async function pollOne(job: {
  id: string; userId: string; toolId: string;
  provider: string; model: string; providerJobId: string | null;
  costTokens: number;
}) {
  if (!job.providerJobId) return;

  const adapter = getAdapter(job.provider as ProviderId);
  let result;
  try {
    result = await adapter.getStatus(job.providerJobId, { model: job.model });
  } catch (err) {
    log.error("getStatus failed", {
      jobId: job.id, provider: job.provider,
      error: err instanceof Error ? err.message : String(err),
    });
    // bump updated_at so we don't hammer a flaky provider every tick
    await db.update(aiJobs).set({ updatedAt: new Date() }).where(eq(aiJobs.id, job.id));
    return;
  }

  if (result.status === "completed") {
    // Claim the terminal transition atomically: only proceed if job is still non-terminal.
    const claimed = await db.update(aiJobs).set({
      status: "completed",
      output: (result.output ?? null) as Record<string, unknown> | null,
      chargedTokens: job.costTokens,
      providerCostUsd: result.costUsd != null ? String(result.costUsd) : null,
      completedAt: new Date(),
    }).where(and(
      eq(aiJobs.id, job.id),
      inArray(aiJobs.status, ["queued", "processing"]),
    )).returning({ id: aiJobs.id });

    if (claimed.length === 0) return; // webhook beat us — nothing to do

    try {
      await charge({
        userId: job.userId, amount: job.costTokens, reserved: job.costTokens,
        jobId: job.id, toolId: job.toolId,
        description: `Tool run completed via poll (${job.provider})`,
      });
    } catch (err) {
      // wallet_charge: reservation not found means watchdog/webhook already released it.
      // Log and continue — we already set status=completed, so user gets their output.
      log.warn("charge after poll-completion failed (likely already settled)", {
        jobId: job.id, error: err instanceof Error ? err.message : String(err),
      });
    }

    try { await ingestJobMedia({ jobId: job.id, userId: job.userId, output: result.output }); }
    catch (err) {
      log.error("ingest failed", {
        jobId: job.id, error: err instanceof Error ? err.message : String(err),
      });
    }
    log.info("polled to completion", { jobId: job.id, provider: job.provider });
    return;
  }

  if (result.status === "failed") {
    const claimed = await db.update(aiJobs).set({
      status: "refunded",
      errorCode: result.error?.code ?? "PROVIDER_FAILED",
      errorMessage: result.error?.message ?? null,
      completedAt: new Date(),
    }).where(and(
      eq(aiJobs.id, job.id),
      inArray(aiJobs.status, ["queued", "processing"]),
    )).returning({ id: aiJobs.id });

    if (claimed.length === 0) return;

    try {
      await refund({
        userId: job.userId, amount: job.costTokens,
        jobId: job.id, toolId: job.toolId,
        description: `Refund via poll: ${result.error?.message ?? "provider failed"}`,
      });
    } catch (err) {
      log.warn("refund after poll-failure failed (likely already settled)", {
        jobId: job.id, error: err instanceof Error ? err.message : String(err),
      });
    }
    log.info("polled to failure", { jobId: job.id, provider: job.provider });
    return;
  }

  // Still in-flight — bump updated_at so we wait POLL_AFTER_SEC before next poll.
  await db.update(aiJobs).set({ updatedAt: new Date() }).where(eq(aiJobs.id, job.id));
}

async function tick() {
  const cutoff = new Date(Date.now() - POLL_AFTER_SEC * 1000);

  const jobs = await db.select({
    id: aiJobs.id, userId: aiJobs.userId, toolId: aiJobs.toolId,
    provider: aiJobs.provider, model: aiJobs.model,
    providerJobId: aiJobs.providerJobId, costTokens: aiJobs.costTokens,
  })
    .from(aiJobs)
    .where(and(
      inArray(aiJobs.status, ["queued", "processing"]),
      isNotNull(aiJobs.providerJobId),
      lt(aiJobs.updatedAt, cutoff),
    ))
    .limit(BATCH_LIMIT);

  if (jobs.length === 0) return;
  log.debug("polling jobs", { count: jobs.length });

  await Promise.allSettled(jobs.map(pollOne));
}

export function startPoller() {
  log.info("poller started", { tickSec: TICK_SEC, pollAfterSec: POLL_AFTER_SEC, batch: BATCH_LIMIT });
  void tick().catch((e) => log.error("initial tick failed", { error: String(e) }));
  return setInterval(() => {
    void tick().catch((e) => log.error("tick failed", { error: String(e) }));
  }, TICK_SEC * 1000);
}
