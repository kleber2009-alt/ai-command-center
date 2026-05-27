// Universal wrapper over the Anthropic SDK, per ТЗ §3.3:
//   - model alias selection (opus for creative, haiku for routine);
//   - JSON-Schema validation of structured outputs (ajv);
//   - retries with exponential backoff (max 3 attempts);
//   - append-only audit log of every call (prompt, tokens, cost, latency);
//   - prompt caching of the system prompt.

import Anthropic from '@anthropic-ai/sdk';
import { Ajv, type Schema, type ValidateFunction } from 'ajv';
import { loadPrompt, type PromptVariables } from '../lib/prompt.js';
import { log, recordClaudeCall } from '../lib/logger.js';

export type ModelAlias = 'opus' | 'haiku';

const MODEL_IDS: Record<ModelAlias, string> = {
  opus: 'claude-opus-4-7',
  haiku: 'claude-haiku-4-5-20251001',
};

// Approximate USD per million tokens. Used only for the cost column in the
// audit log — update when Anthropic pricing changes.
const PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-4-7': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

// 408 timeout, 409 conflict, 425 too-early, 429 rate-limit, 500/502/503/504
// generic 5xx, 529 Anthropic "overloaded" (часто бывает в пиках, всегда
// retriable per Anthropic docs).
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export interface CallClaudeOptions {
  /** Path to a prompt template (.md). Mutually exclusive with `prompt`. */
  promptFile?: string;
  /** Inline prompt text. Mutually exclusive with `promptFile`. */
  prompt?: string;
  variables?: PromptVariables;
  /** System prompt — sent as a cached block (prompt caching). */
  system?: string;
  /** ajv schema. When set, the response is parsed as JSON and validated. */
  outputSchema?: Schema;
  /** Defaults to 'haiku' (routine). Use 'opus' for creative generation. */
  model?: ModelAlias;
  maxTokens?: number;
  temperature?: number;
  /** Max total attempts including the first. Default 3. */
  maxAttempts?: number;
}

const ajv = new Ajv({ discriminator: true, allErrors: true });
const validatorCache = new WeakMap<object, ValidateFunction>();

function getValidator(schema: Schema): ValidateFunction {
  if (typeof schema === 'object' && schema !== null) {
    const cached = validatorCache.get(schema);
    if (cached) return cached;
    const compiled = ajv.compile(schema);
    validatorCache.set(schema, compiled);
    return compiled;
  }
  return ajv.compile(schema);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function estimateCost(model: string, usage: Anthropic.Messages.Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (input * p.input +
      output * p.output +
      cacheWrite * p.cacheWrite +
      cacheRead * p.cacheRead) /
    1_000_000
  );
}

// Pull a JSON value out of a model response that may wrap it in prose or a
// ```json fence.
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fenced / embedded extraction
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }

  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start !== -1) {
    const openChar = trimmed[start];
    const closeChar = openChar === '{' ? '}' : ']';
    const end = trimmed.lastIndexOf(closeChar);
    if (end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
  }
  throw new Error('No JSON value found in model response');
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
    return RETRYABLE_STATUS.has(err.status);
  }
  // Network errors / validation failures are retryable.
  return true;
}

export async function callClaude<T>(
  opts: CallClaudeOptions & { outputSchema: Schema },
): Promise<T>;
export async function callClaude(opts: CallClaudeOptions): Promise<string>;
export async function callClaude<T>(opts: CallClaudeOptions): Promise<T | string> {
  if (!opts.promptFile && !opts.prompt) {
    throw new Error('callClaude requires either `promptFile` or `prompt`');
  }

  const model = MODEL_IDS[opts.model ?? 'haiku'];
  const maxAttempts = opts.maxAttempts ?? 5;
  const userContent = opts.promptFile
    ? await loadPrompt(opts.promptFile, opts.variables)
    : interpolateInline(opts.prompt!, opts.variables);

  const system: Anthropic.Messages.TextBlockParam[] | undefined = opts.system
    ? [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }]
    : undefined;

  const startedAt = Date.now();
  const usageTotal = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await getClient().messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: userContent }],
      });

      usageTotal.input_tokens += response.usage.input_tokens ?? 0;
      usageTotal.output_tokens += response.usage.output_tokens ?? 0;
      usageTotal.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
      usageTotal.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;

      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      if (!opts.outputSchema) {
        await audit({ opts, model, attempt, startedAt, usageTotal, ok: true });
        return text;
      }

      let parsed: unknown;
      try {
        parsed = extractJson(text);
      } catch (parseErr) {
        log.warn('Claude response: JSON extraction failed', {
          model,
          attempt,
          snippet: text.slice(0, 600),
        });
        throw parseErr;
      }
      const validate = getValidator(opts.outputSchema);
      if (!validate(parsed)) {
        log.warn('Claude response: schema validation failed', {
          model,
          attempt,
          snippet: JSON.stringify(parsed).slice(0, 600),
        });
        throw new Error(
          `Output failed schema validation: ${ajv.errorsText(validate.errors, { separator: '; ' })}`,
        );
      }
      await audit({ opts, model, attempt, startedAt, usageTotal, ok: true });
      return parsed as T;
    } catch (err) {
      lastError = err;
      const willRetry = attempt < maxAttempts && isRetryable(err);
      log.warn(`Claude call attempt ${attempt}/${maxAttempts} failed`, {
        model,
        willRetry,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!willRetry) break;
      // 529 (overloaded) держится дольше — стартуем с 4 с, иначе с 1 с.
      // Exponential: 1/2/4/8/16 либо 4/8/16/32/64 для 529.
      const is529 = err instanceof Anthropic.APIError && err.status === 529;
      const baseMs = is529 ? 4000 : 1000;
      await sleep(2 ** (attempt - 1) * baseMs);
    }
  }

  await audit({
    opts,
    model,
    attempt: maxAttempts,
    startedAt,
    usageTotal,
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError instanceof Error
    ? lastError
    : new Error(`Claude call failed: ${String(lastError)}`);
}

function interpolateInline(prompt: string, variables?: PromptVariables): string {
  if (!variables) return prompt;
  return prompt.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) =>
    key in variables ? String(variables[key]) : `{{${key}}}`,
  );
}

async function audit(args: {
  opts: CallClaudeOptions;
  model: string;
  attempt: number;
  startedAt: number;
  usageTotal: Anthropic.Messages.Usage;
  ok: boolean;
  error?: string;
}): Promise<void> {
  await recordClaudeCall({
    timestamp: new Date().toISOString(),
    promptFile: args.opts.promptFile,
    model: args.model,
    attempts: args.attempt,
    durationMs: Date.now() - args.startedAt,
    inputTokens: args.usageTotal.input_tokens ?? 0,
    outputTokens: args.usageTotal.output_tokens ?? 0,
    cacheReadTokens: args.usageTotal.cache_read_input_tokens ?? 0,
    cacheWriteTokens: args.usageTotal.cache_creation_input_tokens ?? 0,
    estimatedCostUsd: Number(estimateCost(args.model, args.usageTotal).toFixed(6)),
    ok: args.ok,
    error: args.error,
  });
}
