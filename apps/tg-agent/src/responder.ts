import Anthropic from '@anthropic-ai/sdk';

import { loadKnowledgeBase } from './knowledge/index.js';
import type { PromptConfig } from './prompt-config.js';
import {
  buildResponderSystemPrompt,
  buildResponderUserMessage,
} from './prompts.js';
import type { MessageClass } from './types.js';

export interface ResponderOptions {
  apiKey: string;
  model: string;
  promptConfig?: PromptConfig;
}

export interface RespondInput {
  messageClass: MessageClass;
  text: string;
  authorDisplay?: string;
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

const MAX_REPLY_TOKENS = 350;

export function createResponder({ apiKey, model, promptConfig }: ResponderOptions): Responder {
  const client = new Anthropic({ apiKey });

  async function call(input: RespondInput): Promise<ResponderResult> {
    const kb = loadKnowledgeBase();
    const systemText = buildResponderSystemPrompt(kb.raw, promptConfig?.getTone());

    const response = await client.messages.create({
      model,
      max_tokens: MAX_REPLY_TOKENS,
      // System as an array of typed blocks so we can attach
      // cache_control. The bytes of `systemText` are stable across
      // every call as long as knowledge_base.md doesn't change, so
      // this caches on Anthropic's side once the prefix is large
      // enough (Haiku 4.5 needs ≥ 4096 tokens — see
      // shared/prompt-caching.md). The dynamic per-class strategy is
      // in the user turn, after the cache breakpoint.
      system: [
        {
          type: 'text',
          text: systemText,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildResponderUserMessage({
            messageClass: input.messageClass,
            text: input.text,
            authorDisplay: input.authorDisplay,
            strategies: promptConfig?.getStrategies(),
          }),
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      throw new Error('Responder returned empty reply');
    }

    return {
      text,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
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
