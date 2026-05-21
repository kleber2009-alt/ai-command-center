// fal.ai adapter. Uses the queue API (POST /queue + webhook).
// Docs: https://fal.ai/docs/serverless/queue
//
// Submit returns immediately with a request_id (== providerJobId). When the
// model finishes, fal POSTs to webhookUrl with the result. We verify the
// X-Fal-Webhook-Signature header against PROVIDER_WEBHOOK_SECRET.

import { ProviderError, type ProviderAdapter, type ProviderResult, type SubmitArgs } from "../types";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

// fal signs webhooks with Ed25519. Public keys come from their JWKS endpoint;
// cache for 24h per their guidance. Each JWK has `x` = base64url-encoded
// 32-byte raw Ed25519 public key. Node's crypto.verify needs an SPKI DER, so
// we prepend the fixed Ed25519 SPKI header.
const FAL_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const FAL_JWKS_TTL_MS = 24 * 3600 * 1000;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const WEBHOOK_TS_TOLERANCE_SEC = 300;

let falJwksCache: { keys: ReturnType<typeof createPublicKey>[]; expires: number } | null = null;

async function falPublicKeys(): Promise<ReturnType<typeof createPublicKey>[]> {
  const now = Date.now();
  if (falJwksCache && falJwksCache.expires > now) return falJwksCache.keys;
  const res = await fetch(FAL_JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`fal JWKS fetch failed: HTTP ${res.status}`);
  const doc = await res.json() as { keys?: Array<{ x?: string; kty?: string; crv?: string }> };
  const keys = (doc.keys ?? [])
    .filter(k => k.kty === "OKP" && k.crv === "Ed25519" && typeof k.x === "string")
    .map(k => createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(k.x!, "base64url")]),
      format: "der", type: "spki",
    }));
  if (keys.length === 0) throw new Error("fal JWKS returned no Ed25519 keys");
  falJwksCache = { keys, expires: now + FAL_JWKS_TTL_MS };
  return keys;
}

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

  async getStatus(providerJobId: string, opts?: { model?: string }): Promise<ProviderResult> {
    const key = process.env.FAL_KEY;
    if (!key) throw new ProviderError("fal", "MISSING_KEY", "FAL_KEY env not set");

    // fal queue is per-application. Path is /{appName}/requests/{id}/status, where
    // appName is the first two segments of the model id (e.g. model
    // "fal-ai/kling-video/v2.1/master/image-to-video" → app "fal-ai/kling-video").
    const app = opts?.model?.split("/").slice(0, 2).join("/");
    if (!app) throw new ProviderError("fal", "MISSING_MODEL", "fal.getStatus requires model in opts");

    const res = await fetch(`${FAL_BASE}/${app}/requests/${providerJobId}/status`, {
      headers: { "Authorization": `Key ${key}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!res.ok) throw new ProviderError("fal", `HTTP_${res.status}`, await res.text());
    const data = await res.json() as { status: string; logs?: unknown };

    if (data.status === "COMPLETED") {
      const out = await fetch(`${FAL_BASE}/${app}/requests/${providerJobId}`, {
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

  // fal verification scheme (per https://fal.ai/docs/model-endpoints/webhooks):
  //   1. Headers x-fal-webhook-{request-id, user-id, timestamp, signature}.
  //   2. Timestamp must be within ±300s of now.
  //   3. message = `${request_id}\n${user_id}\n${timestamp}\n${sha256_hex(body)}`
  //   4. Verify Ed25519 signature (hex-decoded) against any key from JWKS.
  // The `secret` parameter is ignored — fal uses asymmetric crypto, no shared secret.
  async parseWebhook(headers, body, _secret) {
    const reqId = headers["x-fal-webhook-request-id"];
    const userId = headers["x-fal-webhook-user-id"];
    const tsHeader = headers["x-fal-webhook-timestamp"];
    const sigHex = headers["x-fal-webhook-signature"];
    if (!reqId || !userId || !tsHeader || !sigHex
        || typeof reqId !== "string" || typeof userId !== "string"
        || typeof tsHeader !== "string" || typeof sigHex !== "string") {
      return null;
    }

    const ts = Number(tsHeader);
    if (!Number.isFinite(ts)) return null;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > WEBHOOK_TS_TOLERANCE_SEC) return null;

    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const bodyHash = createHash("sha256").update(raw).digest("hex");
    const message = Buffer.from(`${reqId}\n${userId}\n${ts}\n${bodyHash}`);

    let sigBytes: Buffer;
    try { sigBytes = Buffer.from(sigHex, "hex"); }
    catch { return null; }
    if (sigBytes.length !== 64) return null;

    let verified = false;
    try {
      const keys = await falPublicKeys();
      for (const key of keys) {
        if (cryptoVerify(null, message, key, sigBytes)) { verified = true; break; }
      }
    } catch {
      return null;
    }
    if (!verified) return null;

    const parsed = (typeof body === "string" ? JSON.parse(body) : body) as {
      request_id: string;
      status: "OK" | "ERROR";
      payload?: unknown;
      error?: string;
    };

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
