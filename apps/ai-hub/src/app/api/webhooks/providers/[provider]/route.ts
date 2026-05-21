// Provider webhook endpoint. URL: POST /api/webhooks/providers/:provider?jobId=<uuid>
//
// Two layers of idempotency:
//   1. webhook_events.event_id (composite from provider+request) — Stripe-style dedup
//   2. ai_jobs.status terminal check — protects against legitimate replays

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";
import { getAdapter } from "@/lib/providers/router";
import { providerWebhookSecret } from "@/lib/providers/secrets";
import { charge, refund } from "@/lib/wallet";
import { ingestJobMedia } from "@/lib/jobs/ingest";
import { beginWebhook, finishWebhook } from "@/lib/webhooks/dedup";
import { child } from "@/lib/logger";
import type { ProviderId } from "@/lib/db/schema";

const log = child("webhook.provider");
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerSlug } = await params;
  const provider = providerSlug as ProviderId;
  const secret = providerWebhookSecret(provider);
  if (!secret) return NextResponse.json({ error: "webhook_secret_missing", provider }, { status: 500 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "missing_jobId" }, { status: 400 });

  const adapter = getAdapter(provider);

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const rawBody = await req.text();

  const parsed = await adapter.parseWebhook(headers, rawBody, secret);
  if (!parsed) {
    log.warn("invalid signature", { provider, jobId });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // === Idempotency level 1: dedup by provider event_id ===
  // We use providerJobId as the dedup key — provider's task_id is its event_id
  // for completion events. (For multi-event providers like Replicate we could
  // use a status-specific compound key like `${providerJobId}:${status}` but
  // completion is the only event we act on, so this is sufficient.)
  const eventId = parsed.providerJobId ?? jobId;
  const dedup = await beginWebhook(provider, eventId, "verified", {
    jobId, status: parsed.result.status,
  });
  if (dedup.duplicate) {
    log.info("provider webhook duplicate ack", { provider, eventId, jobId });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const [job] = await db.select({
      id: aiJobs.id, userId: aiJobs.userId, toolId: aiJobs.toolId,
      costTokens: aiJobs.costTokens, status: aiJobs.status, provider: aiJobs.provider,
    }).from(aiJobs).where(eq(aiJobs.id, jobId)).limit(1);

    if (!job) {
      await finishWebhook(dedup.id, "job_not_found");
      return NextResponse.json({ error: "job_not_found" }, { status: 404 });
    }
    if (job.provider !== provider) {
      await finishWebhook(dedup.id, "provider_mismatch");
      return NextResponse.json({ error: "provider_mismatch" }, { status: 400 });
    }

    // === Idempotency level 2: job.status terminal check ===
    if (job.status === "completed" || job.status === "refunded" || job.status === "failed") {
      await finishWebhook(dedup.id, null);
      return NextResponse.json({ ok: true, job_duplicate: true });
    }

    const result = parsed.result;

    if (result.status === "completed") {
      await charge({
        userId: job.userId, amount: job.costTokens, reserved: job.costTokens,
        jobId: job.id, toolId: job.toolId,
        description: `Tool run completed (${provider})`,
      });
      await db.update(aiJobs).set({
        status: "completed",
        output: (result.output ?? null) as Record<string, unknown> | null,
        chargedTokens: job.costTokens,
        providerCostUsd: result.costUsd != null ? String(result.costUsd) : null,
        completedAt: new Date(),
      }).where(eq(aiJobs.id, job.id));

      try {
        await ingestJobMedia({ jobId: job.id, userId: job.userId, output: result.output });
      } catch (err) {
        log.error("ingest failed", { jobId: job.id, error: err instanceof Error ? err.message : String(err) });
      }
    } else if (result.status === "failed") {
      await refund({
        userId: job.userId, amount: job.costTokens,
        jobId: job.id, toolId: job.toolId,
        description: `Refund: ${result.error?.message ?? "provider failed"}`,
      });
      await db.update(aiJobs).set({
        status: "refunded",
        errorCode: result.error?.code ?? "PROVIDER_FAILED",
        errorMessage: result.error?.message ?? null,
        completedAt: new Date(),
      }).where(eq(aiJobs.id, job.id));
    } else {
      await db.update(aiJobs).set({
        status: result.status === "processing" ? "processing" : "queued",
      }).where(eq(aiJobs.id, job.id));
    }

    await finishWebhook(dedup.id, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishWebhook(dedup.id, msg);
    log.error("provider webhook handler error", { provider, jobId, error: msg });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
