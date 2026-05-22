// Replicate adapter.
// Docs: https://replicate.com/docs/reference/http
// Webhooks: https://replicate.com/docs/topics/webhooks
//
// Replicate uses Standard Webhooks (svix) signature format:
//   webhook-id, webhook-timestamp, webhook-signature: "v1,<base64sig>"
//   signed payload = `${webhook-id}.${webhook-timestamp}.${rawBody}`
//   HMAC-SHA256 with the account's signing secret (whsec_… is base64-encoded)

import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderError, type ProviderAdapter, type ProviderResult, type SubmitArgs } from "../types";

const REPLICATE_BASE = "https://api.replicate.com/v1";
const SUBMIT_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;

export const replicateAdapter: ProviderAdapter = {
  id: "replicate",

  async submit({ model, input, webhookUrl, jobId }: SubmitArgs): Promise<ProviderResult> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new ProviderError("replicate", "MISSING_KEY", "REPLICATE_API_TOKEN env not set");

    // Two model formats:
    //   "owner/name"          → use /v1/models/{owner}/{name}/predictions (latest version)
    //   "owner/name:version"  → use /v1/predictions with explicit version
    let url: string;
    const body: Record<string, unknown> = { input };

    if (model.includes(":")) {
      const [_, version] = model.split(":");
      body.version = version;
      url = `${REPLICATE_BASE}/predictions`;
    } else {
      url = `${REPLICATE_BASE}/models/${model}/predictions`;
    }

    if (webhookUrl) {
      const wh = new URL(webhookUrl);
      wh.searchParams.set("jobId", jobId);
      body.webhook = wh.toString();
      body.webhook_events_filter = ["completed"];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Prefer": "wait=0",                                  // async — don't block
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new ProviderError("replicate", `HTTP_${res.status}`, errBody.slice(0, 500));
    }

    const data = await res.json() as { id: string; status: string };
    return { status: "queued", providerJobId: data.id };
  },

  async getStatus(providerJobId: string): Promise<ProviderResult> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new ProviderError("replicate", "MISSING_KEY", "REPLICATE_API_TOKEN env not set");

    const res = await fetch(`${REPLICATE_BASE}/predictions/${providerJobId}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!res.ok) throw new ProviderError("replicate", `HTTP_${res.status}`, await res.text());

    const data = await res.json() as {
      status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
      output?: unknown;
      error?: string;
      metrics?: { predict_time?: number };
    };

    if (data.status === "succeeded") {
      return {
        status: "completed",
        providerJobId,
        output: { output: data.output, metrics: data.metrics },
      };
    }
    if (data.status === "failed" || data.status === "canceled") {
      return {
        status: "failed", providerJobId,
        error: { code: data.status.toUpperCase(), message: data.error ?? "replicate job failed" },
      };
    }
    return { status: data.status === "processing" ? "processing" : "queued", providerJobId };
  },

  async parseWebhook(headers, body, secret) {
    const webhookId = headers["webhook-id"];
    const timestamp = headers["webhook-timestamp"];
    const sigHeader = headers["webhook-signature"];
    if (!webhookId || !timestamp || !sigHeader) return null;

    // Replicate signing secrets are stored as "whsec_<base64>".
    // The base64-decoded bytes are the HMAC key.
    const secretBytes = secret.startsWith("whsec_")
      ? Buffer.from(secret.slice(6), "base64")
      : Buffer.from(secret);

    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const signedPayload = `${webhookId}.${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", secretBytes).update(signedPayload).digest("base64");

    // header format: "v1,sig1 v1,sig2 …" — accept any matching signature
    const sigs = sigHeader.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
    const valid = sigs.some((sig) =>
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    );
    if (!valid) return null;

    // Optional: reject stale webhooks (>5 min off)
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) return null;

    const parsed = (typeof body === "string" ? JSON.parse(body) : body) as {
      id: string;
      status: "succeeded" | "failed" | "canceled" | "starting" | "processing";
      output?: unknown;
      error?: string;
      metrics?: { predict_time?: number };
    };

    if (parsed.status === "succeeded") {
      return {
        providerJobId: parsed.id, jobId: null,
        result: {
          status: "completed", providerJobId: parsed.id,
          output: { output: parsed.output, metrics: parsed.metrics },
        },
      };
    }
    return {
      providerJobId: parsed.id, jobId: null,
      result: {
        status: "failed", providerJobId: parsed.id,
        error: { code: parsed.status.toUpperCase(), message: parsed.error ?? "replicate job failed" },
      },
    };
  },

  async cancel(providerJobId: string) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new ProviderError("replicate", "MISSING_KEY", "REPLICATE_API_TOKEN env not set");
    await fetch(`${REPLICATE_BASE}/predictions/${providerJobId}/cancel`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
  },
};
