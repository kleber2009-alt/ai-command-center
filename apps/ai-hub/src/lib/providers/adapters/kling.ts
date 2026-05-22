// Kling adapter — stub. Implement in Stage 6 (video).
// Docs: https://docs.qingque.cn/d/home/eZQClU2I4yzUSL45BqLzU9rIO

import { ProviderError, type ProviderAdapter } from "../types";

export const klingAdapter: ProviderAdapter = {
  id: "kling",
  async submit() { throw new ProviderError("kling", "NOT_IMPLEMENTED", "Kling adapter pending"); },
  async getStatus() { throw new ProviderError("kling", "NOT_IMPLEMENTED", "Kling adapter pending"); },
  async parseWebhook() { return null; },
};
