// AI Provider abstraction. Every external service (fal.ai, Replicate, Kling,
// Runware, ModelsLab, internal Claude calls) implements this interface so the
// router can swap or fallback without product code changes.

import type { ProviderId } from "@/lib/db/schema";

export type ProviderJobStatus = "queued" | "processing" | "completed" | "failed";

export interface ProviderResult {
  status: ProviderJobStatus;
  output?: unknown;                          // raw provider output (URLs, JSON, etc.)
  error?: { code?: string; message: string };
  costUsd?: number;                          // provider's reported cost, for margin tracking
  providerJobId?: string;
}

export interface SubmitArgs {
  model: string;                             // provider-specific model id
  input: Record<string, unknown>;            // tool-validated input
  webhookUrl?: string;                       // where provider should POST completion
  idempotencyKey?: string;
  jobId: string;                             // our internal ai_jobs.id, included in webhook payload
}

export interface ProviderAdapter {
  readonly id: ProviderId;

  /** Submit a job. Returns immediately with providerJobId; result arrives via webhook
   *  or must be polled via getStatus. For sync providers (e.g. fast inference),
   *  may return status='completed' with output. */
  submit(args: SubmitArgs): Promise<ProviderResult>;

  /** Poll a job's status. Used when no webhook or webhook is late. */
  getStatus(providerJobId: string): Promise<ProviderResult>;

  /** Parse a webhook payload from the provider into our normalized result.
   *  Should verify the signature using `secret`. Returns null if signature invalid. */
  parseWebhook(headers: Record<string, string>, body: unknown, secret: string):
    Promise<{ providerJobId: string; jobId: string | null; result: ProviderResult } | null>;

  /** Cancel an in-flight job, if supported. */
  cancel?(providerJobId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(public readonly providerId: ProviderId, public readonly code: string, message: string) {
    super(`[${providerId}:${code}] ${message}`);
  }
}
