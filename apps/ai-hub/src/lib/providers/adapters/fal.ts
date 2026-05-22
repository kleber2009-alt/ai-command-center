// fal.ai adapter. Uses the queue API (POST /queue + webhook).
// Docs: https://fal.ai/docs/serverless/queue
//
// Submit returns immediately with a request_id (== providerJobId). When the
// model finishes, fal POSTs to webhookUrl with the result. We verify the
// X-Fal-Webhook-Signature header against PROVIDER_WEBHOOK_SECRET.

import { ProviderError, type ProviderAdapter, type ProviderResult, type SubmitArgs } from "../types";
import { createHmac, timingSafeEqual } from "node:crypto";

const FAL_BASE = "https://queue.fal.run";

// Provider HTTP calls bounded. submit() returns fast (it's a queue accept),
// getStatus() too. Long-running rendering is async via webhook — we never
// block on it. So 30s for submit, 15s for status is generous and prevents
// zombie connections.
const SUBMIT_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;

export const falAdapter: ProviderAdapter = {
  id: "fal",

  async submit({ model, input, webhookUrl, jobId, idempotencyKey }: SubmitArgs): Promise<ProviderResult> {
    const key = process.env.FAL_KEY;
    if (!key) throw new ProviderError("fal", "MISSING_KEY", "FAL_KEY env not set");

    // fal lets us pass a webhook URL via query param.
    const url = new URL(`${FAL_BASE}/${model}`);
    if (webhookUrl) {
      // Embed our jobId so we can correlate the webhook back to ai_jobs row.
      const wh = new URL(webhookUrl);
      wh.searchParams.set("jobId", jobId);
      url.searchParams.set("fal_webhook", wh.toString());
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Key ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError("fal", `HTTP_${res.status}`, body.slice(0, 500));
    }

    const data = await res.json() as { request_id: string; status?: string };
    return {
      status: "queued",
      providerJobId: data.request_id,
    };
  },

  async getStatus(providerJobId: string): Promise<ProviderResult> {
    const key = process.env.FAL_KEY;
    if (!key) throw new ProviderError("fal", "MISSING_KEY", "FAL_KEY env not set");

    // Status endpoint per fal docs. Model prefix is required; we keep it in providerJobId
    // by storing "model/request_id" — but for simplicity here, callers must pass full id.
    const res = await fetch(`${FAL_BASE}/requests/${providerJobId}/status`, {
      headers: { "Authorization": `Key ${key}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!res.ok) throw new ProviderError("fal", `HTTP_${res.status}`, await res.text());
    const data = await res.json() as { status: string; logs?: unknown };

    if (data.status === "COMPLETED") {
      const out = await fetch(`${FAL_BASE}/requests/${providerJobId}`, {
        headers: { "Authorization": `Key ${key}` },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      const output = await out.json();
      return { status: "completed", output, providerJobId };
    }
    if (data.status === "IN_QUEUE")     return { status: "queued", providerJobId };
    if (data.status === "IN_PROGRESS")  return { status: "processing", providerJobId };
    return { status: "failed", providerJobId, error: { code: data.status, message: String(data.status) } };
  },

  async parseWebhook(headers, body, secret) {
    const sig = headers["x-fal-webhook-signature"] || headers["X-Fal-Webhook-Signature"];
    if (!sig || typeof sig !== "string") return null;

    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    if (expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;

    const parsed = (typeof body === "string" ? JSON.parse(body) : body) as {
      request_id: string;
      status: "OK" | "ERROR";
      payload?: unknown;
      error?: string;
    };

    // jobId travels via query param on webhook URL; framework should extract it.
    return {
      providerJobId: parsed.request_id,
      jobId: null,                            // route handler reads from query, not body
      result: parsed.status === "OK"
        ? { status: "completed" as const, output: parsed.payload, providerJobId: parsed.request_id }
        : { status: "failed" as const, providerJobId: parsed.request_id,
            error: { code: "PROVIDER_ERROR", message: parsed.error ?? "fal job failed" } },
    };
  },
};
