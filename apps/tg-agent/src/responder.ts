import { createLlmClient, cacheReadTokens, type ReasoningEffort } from './llm.js';
import { loadKnowledgeBase } from './knowledge/index.js';
import type { PromptConfig } from './prompt-config.js';
import {
  buildResponderSystemPrompt,
  buildResponderUserMessage,
} from './prompts.js';
import type { MessageClass } from './types.js';

export interface ResponderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  promptConfig?: PromptConfig;
}

export interface RespondInput {
  messageClass: MessageClass;
  text: string;
  authorDisplay?: string;
  // Pre-formatted RAG snippets injected into the user turn. Each
  // snippet is a few lines; the responder is told to use them for
  // context, not to cite verbatim.
  memoryContext?: string;
}

export interface ResponderResult {
  text: string;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface Responder {
  generate(input: RespondInput): Promise<string>;
  // Same as generate(), but exposes the prompt cache stats so the
  // caller can decide whether to log / surface them.
  generateWithStats(input: RespondInput): Promise<ResponderResult>;
}

// Reasoning tokens on gpt-5.x share the completion budget. We want
// short replies (the prompt enforces that), but the cap must leave
// room for low-effort reasoning on top of the visible answer, or the
// model can spend the whole budget thinking and return empty.
const MAX_REPLY_TOKENS = 900;

export function createResponder({
  apiKey,
  baseUrl,
  model,
  reasoningEffort = 'low',
  promptConfig,
}: ResponderOptions): Responder {
  const client = createLlmClient({ apiKey, baseUrl });

  async function call(input: RespondInput): Promise<ResponderResult> {
    const kb = loadKnowledgeBase();
    const systemText = buildResponderSystemPrompt(kb.raw, promptConfig?.getTone());

    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: MAX_REPLY_TOKENS,
      reasoning_effort: reasoningEffort,
      // `systemText` is stable across calls as long as
      // knowledge_base.md / tone don't change, so codex.sale caches
      // the prefix automatically. The dynamic per-class strategy goes
      // in the user turn, after the cacheable prefix.
      messages: [
        { role: 'system', content: systemText },
        {
          role: 'user',
          content: buildResponderUserMessage({
            messageClass: input.messageClass,
            text: input.text,
            authorDisplay: input.authorDisplay,
            strategies: promptConfig?.getStrategies(),
            memoryContext: input.memoryContext,
          }),
        },
      ],
    });

    const text = (response.choices[0]?.message?.content ?? '').trim();

    if (!text) {
      throw new Error('Responder returned empty reply');
    }

    return {
      text,
      cacheReadInputTokens: cacheReadTokens(response.usage),
      cacheCreationInputTokens: 0,
    };
  }

  return {
    async generate(input): Promise<string> {
      const r = await call(input);
      return r.text;
    },
    generateWithStats: call,
  };
}
