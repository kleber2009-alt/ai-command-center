// ModelsLab adapter — stub.
import { ProviderError, type ProviderAdapter } from "../types";

export const modelslabAdapter: ProviderAdapter = {
  id: "modelslab",
  async submit() { throw new ProviderError("modelslab", "NOT_IMPLEMENTED", "ModelsLab adapter pending"); },
  async getStatus() { throw new ProviderError("modelslab", "NOT_IMPLEMENTED", "ModelsLab adapter pending"); },
  async parseWebhook() { return null; },
};
