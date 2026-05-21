// AIProviderRouter — picks the right adapter for a job.
// Today it's a static map; later we plug in fallback chains, A/B testing,
// and per-region routing here.

import type { ProviderId } from "@/lib/db/schema";
import type { ProviderAdapter } from "./types";
import { falAdapter } from "./adapters/fal";
import { replicateAdapter } from "./adapters/replicate";
import { klingAdapter } from "./adapters/kling";
import { runwareAdapter } from "./adapters/runware";
import { modelslabAdapter } from "./adapters/modelslab";
import { internalAdapter } from "./adapters/internal";
import { kieAdapter } from "./adapters/kie";

const adapters: Record<ProviderId, ProviderAdapter> = {
  fal:        falAdapter,
  replicate:  replicateAdapter,
  kling:      klingAdapter,
  runware:    runwareAdapter,
  modelslab:  modelslabAdapter,
  internal:   internalAdapter,
  kie:        kieAdapter,
};

export function getAdapter(provider: ProviderId): ProviderAdapter {
  const a = adapters[provider];
  if (!a) throw new Error(`No adapter for provider "${provider}"`);
  return a;
}

export function getAllAdapters(): Record<ProviderId, ProviderAdapter> {
  return adapters;
}
