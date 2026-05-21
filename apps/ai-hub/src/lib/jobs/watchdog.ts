// Watchdog: scans for jobs stuck in queued/processing for >STUCK_MIN minutes,
// refunds tokens, marks status='refunded' with error_code='STUCK_TIMEOUT'.
// Runs as setInterval in worker process (see runner.ts).
//
// Why: provider webhooks can be lost (network, signature mismatch, our outage
// window). Without this, reserved tokens stay locked forever and never get
// returned to the user.

import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";
import { refund } from "@/lib/wallet";
import { child } from "@/lib/logger";

const log = child("watchdog");
const STUCK_MIN = Number(process.env.WATCHDOG_STUCK_MIN ?? "15");
const TICK_SEC  = Number(process.env.WATCHDOG_TICK_SEC ?? "60");

async function sweep() {
  const cutoff = new Date(Date.now() - STUCK_MIN * 60 * 1000);

  const stuck = await db.select({
    id: aiJobs.id, userId: aiJobs.userId, toolId: aiJobs.toolId,
    costTokens: aiJobs.costTokens, status: aiJobs.status,
    createdAt: aiJobs.createdAt, startedAt: aiJobs.startedAt,
  })
    .from(aiJobs)
    .where(and(
      inArray(aiJobs.status, ["queued", "processing"]),
      lt(aiJobs.createdAt, cutoff),
    ))
    .limit(50);

  if (stuck.length === 0) return;
  log.warn(`found ${stuck.length} stuck job(s)`, { stuckMin: STUCK_MIN });

  for (const job of stuck) {
    try {
      await refund({
        userId: job.userId, amount: job.costTokens,
        jobId: job.id, toolId: job.toolId,
        description: `Watchdog: stuck >${STUCK_MIN} min`,
      });
      await db.update(aiJobs).set({
        status: "refunded",
        errorCode: "STUCK_TIMEOUT",
        errorMessage: `No terminal status after ${STUCK_MIN} min`,
        completedAt: new Date(),
      }).where(eq(aiJobs.id, job.id));
      log.info("refunded stuck job", { jobId: job.id, userId: job.userId, tokens: job.costTokens });
    } catch (err) {
      log.error("watchdog refund failed", {
        jobId: job.id, error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function startWatchdog() {
  log.info("watchdog started", { stuckMin: STUCK_MIN, tickSec: TICK_SEC });
  // Run once on boot, then every tick.
  void sweep().catch((e) => log.error("initial sweep failed", { error: String(e) }));
  return setInterval(() => {
    void sweep().catch((e) => log.error("sweep failed", { error: String(e) }));
  }, TICK_SEC * 1000);
}
