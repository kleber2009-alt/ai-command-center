// Generates a validated Carousel JSON via Claude (opus). System prompt =
// Brandbook-only training context (three files in data/brandbook/). User
// prompt = minimal "topic / episode / required-output-fields" — никаких
// rubric prompt templates, никаких few-shot examples, никаких style anchors.
// Источник правды — только Брендбук.

import { callClaude } from './claude.js';
import { carouselSchema, SLIDE_CONTRACT, type Carousel } from '../schemas/carousel.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { loadTrainingContext } from '../lib/training-context.js';

export interface GenerateCarouselOptions {
  rubric: RubricConfig;
  /** Rubric slug from the catalog (used only as a string label inside the
   * required-output-fields JSON example). */
  rubricSlug?: string;
  topic: string;
  episode: number;
  /** Exact number of slides to produce (1..10). */
  slideCount?: number;
  /** RAG context block (knowledge base — kept separately from Brandbook). */
  ragContext?: string;
}

export async function generateCarousel(opts: GenerateCarouselOptions): Promise<Carousel> {
  const system = loadTrainingContext() || undefined;
  const rag = opts.ragContext ? `${opts.ragContext}\n\n` : '';
  const slideCountBlock =
    typeof opts.slideCount === 'number' && opts.slideCount > 0
      ? `\n\n## ЖЁСТКОЕ ОГРАНИЧЕНИЕ\n\nМассив \`slides\` должен содержать РОВНО ${opts.slideCount} элемент(ов). Не больше и не меньше.`
      : '';

  const prompt = [
    `# Карусель`,
    '',
    `Тема: ${opts.topic}`,
    `Эпизод: ${opts.episode}`,
    `Рубрика (slug): ${opts.rubricSlug ?? opts.rubric.label}`,
    '',
    `Источник правды — три файла Брендбука (template.html / brandbook.md / dataset.json) из system-prompt.`,
    `В dataset.json найдёшь реальные эталонные слайды — следуй их структуре, тону и визуальной подаче.`,
    '',
    `## ОБЯЗАТЕЛЬНЫЕ ПОЛЯ ВЫВОДА`,
    '',
    `Верни JSON ровно с этими полями верхнего уровня:`,
    `{`,
    `  "rubric": "${opts.rubricSlug ?? 'hood'}",`,
    `  "topic": "${opts.topic.replace(/"/g, '\\"')}",`,
    `  "episode": ${opts.episode},`,
    `  "slides": [ ... ]`,
    `}`,
    `Поля rubric/topic/episode/slides обязательны, всё остальное запрещено.`,
    '',
    rag,
    `## Контракт полей слайдов`,
    '',
    SLIDE_CONTRACT,
    slideCountBlock,
  ].filter(Boolean).join('\n');

  return callClaude<Carousel>({
    prompt,
    system,
    outputSchema: carouselSchema,
    model: 'opus',
    maxTokens: 4096,
    temperature: 1,
  });
}
