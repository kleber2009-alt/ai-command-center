// Resolve the per-provider webhook signing secret from env.
// Each provider has its own signing scheme; the secret semantics differ —
// some are raw HMAC keys (fal), some are Standard-Webhooks base64 ("whsec_…", Replicate).

import type { ProviderId } from "@/lib/db/schema";

export function providerWebhookSecret(provider: ProviderId): string | null {
  switch (provider) {
    case "fal":       return process.env.FAL_WEBHOOK_SECRET ?? null;
    case "replicate": return process.env.REPLICATE_WEBHOOK_SECRET ?? null;
    case "kling":     return process.env.KLING_WEBHOOK_SECRET ?? null;
    case "runware":   return process.env.RUNWARE_WEBHOOK_SECRET ?? null;
    case "modelslab": return process.env.MODELSLAB_WEBHOOK_SECRET ?? null;
    case "kie":       return process.env.KIE_WEBHOOK_SECRET ?? null;
    case "internal":  return null;
  }
}
