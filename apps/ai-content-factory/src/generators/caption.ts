// Generates a post caption via Claude (haiku — routine), grounded in the
// rubric's tone and the carousel topic.

import { callClaude } from './claude.js';
import { captionSchema, CAPTION_CONTRACT, type CaptionContent } from '../schemas/caption.js';
import { loadPrompt } from '../lib/prompt.js';
import { fromAppRoot } from '../lib/paths.js';

const CAPTION_PROMPT = 'data/prompts/post-caption.md';

export interface GenerateCaptionOptions {
  topic: string;
  format?: 'carousel' | 'reels';
}

export async function generateCaption(opts: GenerateCaptionOptions): Promise<CaptionContent> {
  const template = await loadPrompt(fromAppRoot(CAPTION_PROMPT), {
    topic: opts.topic,
    format: opts.format ?? 'carousel',
  });
  const prompt = `${template}\n\n${CAPTION_CONTRACT}`;

  return callClaude<CaptionContent>({
    prompt,
    outputSchema: captionSchema,
    model: 'haiku',
    maxTokens: 1024,
    temperature: 0.9,
  });
}
