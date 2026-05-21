// Worker process. Run with `npm run worker`.
// For local dev: spawn alongside `next dev`. For prod: separate container.

import "dotenv/config";
import IORedis from "ioredis";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";
import { getAdapter } from "@/lib/providers/router";
import { charge, refund } from "@/lib/wallet";
import { ingestJobMedia } from "@/lib/jobs/ingest";
import { startWatchdog } from "@/lib/jobs/watchdog";
import { startPoller } from "@/lib/jobs/poller";
import { child } from "@/lib/logger";
import type { ProviderId } from "@/lib/db/schema";
import { QUEUE_NAME, type AIJobPayload } from "./queue";

const log = child("worker");

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const webhookBase = process.env.PROVIDER_WEBHOOK_BASE_URL!;

const worker = new Worker<AIJobPayload>(QUEUE_NAME, async (job) => {
  const { jobId, userId, toolId, provider, model, input, costTokens } = job.data;

  await db.update(aiJobs)
    .set({ status: "processing", startedAt: new Date() })
    .where(eq(aiJobs.id, jobId));

  try {
    const adapter = getAdapter(provider as ProviderId);
    const result = await adapter.submit({
      model, input, jobId,
      webhookUrl: `${webhookBase}/api/webhooks/providers/${provider}`,
    });

    await db.update(aiJobs).set({
      providerJobId: result.providerJobId ?? null,
      status: result.status === "completed" ? "completed"
            : result.status === "failed"    ? "failed"
            : "processing",
      output: (result.output ?? null) as Record<string, unknown> | null,
      errorCode: result.error?.code ?? null,
      errorMessage: result.error?.message ?? null,
      completedAt: result.status === "completed" || result.status === "failed" ? new Date() : null,
      providerCostUsd: result.costUsd != null ? String(result.costUsd) : null,
    }).where(eq(aiJobs.id, jobId));

    if (result.status === "failed") {
      await refund({ userId, amount: costTokens, jobId, toolId,
        description: `Auto-refund: ${result.error?.message ?? "provider failed"}` });
      await db.update(aiJobs).set({ status: "refunded" }).where(eq(aiJobs.id, jobId));
    }
    if (result.status === "completed") {
      await charge({ userId, amount: costTokens, reserved: costTokens,
        jobId, toolId, description: `Tool run: ${model}` });
      try { await ingestJobMedia({ jobId, userId, output: result.output }); }
      catch (e) { console.error("[worker] ingest failed", jobId, e); }
    }

    return { providerJobId: result.providerJobId, status: result.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(aiJobs).set({
      status: "refunded", errorCode: "WORKER_ERROR", errorMessage: message,
      completedAt: new Date(),
    }).where(eq(aiJobs.id, jobId));
    await refund({ userId, amount: costTokens, jobId, toolId,
      description: `Auto-refund: ${message}` });
    throw err;
  }
}, { connection, concurrency: 8, lockDuration: 5 * 60_000 });   // 5m — research jobs (apify+claude) can take ~90s

worker.on("ready",     () => log.info("worker ready"));
worker.on("failed",    (j, err) => log.error("job failed", { jobId: j?.id, error: err?.message }));
worker.on("completed", (j) => log.info("job completed", { jobId: j.id }));

const watchdogTimer = startWatchdog();
const pollerTimer = startPoller();

process.on("SIGTERM", async () => {
  log.info("SIGTERM received, shutting down");
  clearInterval(watchdogTimer);
  clearInterval(pollerTimer);
  await worker.close();
  process.exit(0);
});
