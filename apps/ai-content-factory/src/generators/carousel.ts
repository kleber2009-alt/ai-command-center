// Generates a validated Carousel JSON via Claude (opus — creative), grounded in
// the rubric's prompt template and few-shot examples.

import { readFile } from 'node:fs/promises';
import { callClaude } from './claude.js';
import { carouselSchema, type Carousel } from '../schemas/carousel.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { fromAppRoot } from '../lib/paths.js';

export interface GenerateCarouselOptions {
  rubric: RubricConfig;
  topic: string;
  episode: number;
}

export async function generateCarousel(opts: GenerateCarouselOptions): Promise<Carousel> {
  // Few-shot examples go in the cached system prompt (prompt caching), the task
  // template in the user message.
  let system: string | undefined;
  if (opts.rubric.examplesFile) {
    try {
      system = await readFile(fromAppRoot(opts.rubric.examplesFile), 'utf8');
    } catch {
      system = undefined;
    }
  }

  return callClaude<Carousel>({
    promptFile: fromAppRoot(opts.rubric.promptFile),
    variables: { topic: opts.topic, episode: opts.episode },
    system,
    outputSchema: carouselSchema,
    model: 'opus',
    maxTokens: 4096,
    temperature: 1,
  });
}
