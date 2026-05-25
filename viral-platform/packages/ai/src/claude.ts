import Anthropic from '@anthropic-ai/sdk';
import { MODELS } from '@vp/shared';

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type ClaudeTier = 'smart' | 'cheap';

export interface CompleteOptions {
  tier?: ClaudeTier;
  maxTokens?: number;
  system?: string;
  temperature?: number;
}

/** Single-turn completion returning the concatenated text content. */
export async function complete(prompt: string, opts: CompleteOptions = {}): Promise<string> {
  const model = opts.tier === 'cheap' ? MODELS.cheap : MODELS.smart;
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.4,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}
