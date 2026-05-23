// Claude responder. Pulls the active prompt_version from Postgres at every
// call so flipping the active row in the admin takes effect on the next
// message — no process restart needed.

import Anthropic from '@anthropic-ai/sdk';

import type { Logger } from './logger.js';
import type { PromptStore, PromptVersion } from './db/prompts.js';
import type { Message } from './db/messages.js';

export interface ResponderResult {
  text: string;
  model: string;
  promptVersion: string;
  tokensUsed: number;
}

export interface Responder {
  reply(ctx: {
    userText: string;
    history: Message[];
    segment?: string | null;
  }): Promise<ResponderResult>;
}

export interface ResponderOptions {
  apiKey: string;
  model: string;
  prompts: PromptStore;
  logger: Logger;
  // Hard cap on output length — Instagram DMs render badly past ~600 chars.
  maxTokens?: number;
}

const FALLBACK_PROMPT: PromptVersion = {
  id: 'fallback',
  version: 'fallback',
  system_prompt:
    'Ты — AI-ассистент в Instagram Direct. Отвечай кратко (1–3 предложения), вежливо, на языке собеседника. Не выдумывай факты.',
  segment: null,
  active: true,
  created_at: new Date(0).toISOString(),
};

export function createResponder(opts: ResponderOptions): Responder {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });
  const maxTokens = opts.maxTokens ?? 400;

  return {
    async reply({ userText, history, segment }) {
      const prompt = (await opts.prompts.active(segment)) ?? FALLBACK_PROMPT;

      // Compact prior messages into role-tagged turns. Outgoing from us =
      // assistant, incoming from user = user. Manual messages from the owner
      // get the assistant role too — to the LLM they look like prior replies.
      const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (const m of history) {
        if (!m.text) continue;
        if (m.direction === 'incoming') turns.push({ role: 'user', content: m.text });
        else turns.push({ role: 'assistant', content: m.text });
      }
      turns.push({ role: 'user', content: userText });

      const res = await anthropic.messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        // Cache the system prompt — it's the same across requests for the
        // same active prompt_version, so we pay tokens once per ~5min window.
        system: [
          {
            type: 'text',
            text: prompt.system_prompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: turns,
      });

      // Concatenate text blocks; Claude returns 1 block in 99% of cases here.
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      if (!text) {
        opts.logger.warn('responder produced empty output', { model: opts.model });
        throw new Error('responder produced empty output');
      }

      return {
        text,
        model: opts.model,
        promptVersion: prompt.version,
        tokensUsed: (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0),
      };
    },
  };
}
