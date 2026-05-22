// Runware adapter — stub.
import { ProviderError, type ProviderAdapter } from "../types";

export const runwareAdapter: ProviderAdapter = {
  id: "runware",
  async submit() { throw new ProviderError("runware", "NOT_IMPLEMENTED", "Runware adapter pending"); },
  async getStatus() { throw new ProviderError("runware", "NOT_IMPLEMENTED", "Runware adapter pending"); },
  async parseWebhook() { return null; },
};
