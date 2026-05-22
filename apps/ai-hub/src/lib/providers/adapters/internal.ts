// Internal adapter — for tools that call our own infra (e.g. Claude API for
// Reels script generation). Stub for now.

import { ProviderError, type ProviderAdapter } from "../types";

export const internalAdapter: ProviderAdapter = {
  id: "internal",
  async submit() { throw new ProviderError("internal", "NOT_IMPLEMENTED", "Internal adapter pending"); },
  async getStatus() { throw new ProviderError("internal", "NOT_IMPLEMENTED", "Internal adapter pending"); },
  async parseWebhook() { return null; },
};
