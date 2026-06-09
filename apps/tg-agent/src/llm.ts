import OpenAI from 'openai';

// Shared OpenAI-compatible client for codex.sale (and any other
// OpenAI-compatible gateway). The classifier, responder and digest
// generator all talk to /v1/chat/completions through this client.
//
// codex.sale exposes reasoning models (gpt-5.x). Reasoning tokens
// count against the completion budget, so callers must size
// max_completion_tokens generously and keep reasoning_effort low for
// the high-volume, latency-sensitive paths (classify / respond).

// Standard OpenAI reasoning levels. codex.sale also accepts "xhigh",
// but we never need it here — "low" keeps per-message cost + latency
// down for a Telegram bot.
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface LlmClientOptions {
  apiKey: string;
  baseUrl: string;
}

export function createLlmClient({ apiKey, baseUrl }: LlmClientOptions): OpenAI {
  return new OpenAI({ apiKey, baseURL: baseUrl });
}

// codex.sale (OpenAI-style) returns prompt-cache hits under
// usage.prompt_tokens_details.cached_tokens. We surface it as
// cacheReadInputTokens so existing logging keeps working; there's no
// separate "cache creation" counter in the OpenAI shape.
export function cacheReadTokens(
  usage: OpenAI.Completions.CompletionUsage | undefined,
): number {
  return usage?.prompt_tokens_details?.cached_tokens ?? 0;
}
