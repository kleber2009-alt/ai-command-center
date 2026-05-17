import Anthropic from '@anthropic-ai/sdk';

import { loadKnowledgeBase } from './knowledge/index.js';
import { buildResponderSystemPrompt } from './prompts.js';
import type { MessageClass } from './types.js';

export interface ResponderOptions {
  apiKey: string;
  model: string;
}

export interface RespondInput {
  messageClass: MessageClass;
  text: string;
  // Optional Telegram username/first name for natural addressing.
  authorDisplay?: string;
}

export interface Responder {
  generate(input: RespondInput): Promise<string>;
}

const MAX_REPLY_TOKENS = 350;

export function createResponder({ apiKey, model }: ResponderOptions): Responder {
  const client = new Anthropic({ apiKey });

  return {
    async generate({ messageClass, text, authorDisplay }: RespondInput): Promise<string> {
      const kb = loadKnowledgeBase();
      const systemPrompt = buildResponderSystemPrompt(messageClass, kb.raw);

      const userTurn = authorDisplay
        ? `Сообщение от ${authorDisplay}:\n\n"""\n${text}\n"""\n\nОтветь в чат.`
        : `Сообщение:\n\n"""\n${text}\n"""\n\nОтветь в чат.`;

      const response = await client.messages.create({
        model,
        max_tokens: MAX_REPLY_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userTurn }],
      });

      const reply = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();

      if (!reply) {
        throw new Error('Responder returned empty reply');
      }

      return reply;
    },
  };
}
