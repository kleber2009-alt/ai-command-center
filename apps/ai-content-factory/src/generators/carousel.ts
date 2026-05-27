// Generates a validated Carousel JSON via Claude (opus — creative). System
// prompt = Brandbook-only training context (three files in data/brandbook/).
// Everything else (references library, prompts/*, rubric.examplesFile) is
// explicitly excluded per editor decision.

import { callClaude } from './claude.js';
import { carouselSchema, SLIDE_CONTRACT, type Carousel } from '../schemas/carousel.js';
import { loadPrompt } from '../lib/prompt.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { fromAppRoot } from '../lib/paths.js';
import { loadTrainingContext } from '../lib/training-context.js';

export interface GenerateCarouselOptions {
  rubric: RubricConfig;
  /** Rubric slug from the catalog (diary/hood/routine/money). Used to filter
   * training-context so only the current rubric's brief is included. */
  rubricSlug?: string;
  topic: string;
  episode: number;
  /** Exact number of slides to produce (1..10). When set, injects a hard
   * constraint into the prompt so Claude doesn't over- or under-shoot. */
  slideCount?: number;
  /** RAG context block (top/low performers + learnings) to ground generation. */
  ragContext?: string;
}

export async function generateCarousel(opts: GenerateCarouselOptions): Promise<Carousel> {
  // System prompt = Brandbook-only training context. No rubric.examplesFile,
  // no references catalog, no prompts/* — those are excluded by design.
  const system = loadTrainingContext({ rubricSlug: opts.rubricSlug, format: 'carousel' }) || undefined;

  // Interpolate the template, then append the exact slide-field contract so the
  // model emits schema-valid JSON.
  const template = await loadPrompt(fromAppRoot(opts.rubric.promptFile), {
    topic: opts.topic,
    episode: opts.episode,
  });
  const rag = opts.ragContext ? `${opts.ragContext}\n\n` : '';
  const slideCountBlock =
    typeof opts.slideCount === 'number' && opts.slideCount > 0
      ? `\n\n## ЖЁСТКОЕ ОГРАНИЧЕНИЕ\n\nМассив \`slides\` должен содержать РОВНО ${opts.slideCount} элемент(ов). Не больше и не меньше. Если структура рубрики требует больше — сократи; если меньше — расширь дополнительными слайдами типа list/quote/stat.`
      : '';
  const prompt = `${template}\n\n${rag}## Контракт полей слайдов\n\n${SLIDE_CONTRACT}${slideCountBlock}`;

  return callClaude<Carousel>({
    prompt,
    system,
    outputSchema: carouselSchema,
    model: 'opus',
    maxTokens: 4096,
    temperature: 1,
  });
}
