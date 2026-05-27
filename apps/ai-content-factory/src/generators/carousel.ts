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
  /** Style anchor — author handle (без @) из dataset.json. Если задан, Claude
   * получает прямую инструкцию имитировать этот стиль из brandbook/dataset.json. */
  styleAuthor?: string;
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  'ilia.paliy':
    'провокационный RU-кликбейт. Заголовки CAPS чёрным на белом. Кобальтово-синие шаги (#2D5BFF), круглые синие чекмарки. Тёмные mockup\'ы с PDF / интерфейсами Claude и эффектом голубого glow. Финальный CTA-слайд: кодовое слово синим подчёркнутым. Cover-слайды — full-bleed фото знаменитостей / 3D-объекты с поверхностным заголовком капсом.',
  theromanknox:
    'премиум 3D-рендеры на тёмно-коричневом фоне, peach/cream подставки, оранжевый Claude-asterisk. Бежевый off-white grid background для контентных слайдов. Comparison-карточки (coral pink vs mint green, или Paid vs Free). YouTube-thumbnail mockup\'ы с дуоколорным watercolor headline. Английский язык. Footer: "Social media @Roman.Knox", "Free Guides knoxhub.io/hub", page indicator.',
  drcintas:
    'Hollywood vibe — cinematic neon-розово-фиолетовая палитра, dramatic key-light портреты, glossy 3D-объекты, типографика с большими капсами + accent colors. Тон: AI меняет киноиндустрию.',
  julieta_publicista:
    'minimalist warm — кремовый фон, чёткая business-advice типографика, испаноязычная подача. Структура «совет → шаг → результат», без декоративных излишеств.',
};

export async function generateCarousel(opts: GenerateCarouselOptions): Promise<Carousel> {
  // System prompt = Brandbook-only training context. No rubric.examplesFile,
  // no references catalog, no prompts/* — those are excluded by design.
  const system = loadTrainingContext({ rubricSlug: opts.rubricSlug, format: 'carousel' }) || undefined;

  // When a style anchor is selected, the editor explicitly wants the carousel
  // to be driven by the chosen author's dataset entries — not by the rubric
  // prompt template (which prescribes a different tone / structure). Skip the
  // rubric template entirely in that case and feed Claude a minimal "topic →
  // carousel" prompt anchored to the dataset author.
  let template: string;
  if (opts.styleAuthor) {
    template = [
      `# Карусель в стиле @${opts.styleAuthor}`,
      '',
      `Тема: ${opts.topic}`,
      `Эпизод: ${opts.episode}`,
      `Рубрика (slug): ${opts.rubricSlug ?? opts.rubric.label}`,
      '',
      `Источник правды — три файла Брендбука (см. system-prompt). В частности,`,
      `в \`data/brandbook/dataset.json\` есть реальные слайды этого автора —`,
      `следуй их структуре воронки (cover → hook → step → proof → cta),`,
      `типографике и тону.`,
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
    ].join('\n');
  } else {
    template = await loadPrompt(fromAppRoot(opts.rubric.promptFile), {
      topic: opts.topic,
      episode: opts.episode,
    });
  }
  const rag = opts.ragContext ? `${opts.ragContext}\n\n` : '';
  const slideCountBlock =
    typeof opts.slideCount === 'number' && opts.slideCount > 0
      ? `\n\n## ЖЁСТКОЕ ОГРАНИЧЕНИЕ\n\nМассив \`slides\` должен содержать РОВНО ${opts.slideCount} элемент(ов). Не больше и не меньше.`
      : '';
  const styleDesc = opts.styleAuthor ? STYLE_DESCRIPTIONS[opts.styleAuthor] : undefined;
  const styleBlock = styleDesc
    ? `\n\n## СТИЛЕВОЙ ANCHOR · @${opts.styleAuthor}\n\nИмитируй стиль автора @${opts.styleAuthor} из \`data/brandbook/dataset.json\`. Найди в массиве \`slides\` все слайды с \`author\` === "@${opts.styleAuthor}" и следуй их подаче. ИГНОРИРУЙ рубрику-обёртку — стиль автора главнее.\n\nКлючевые черты: ${styleDesc}\n\nНе копируй текст дословно — заимствуй приёмы.`
    : '';
  const prompt = `${template}\n\n${rag}## Контракт полей слайдов\n\n${SLIDE_CONTRACT}${slideCountBlock}${styleBlock}`;

  return callClaude<Carousel>({
    prompt,
    system,
    outputSchema: carouselSchema,
    model: 'opus',
    maxTokens: 4096,
    temperature: 1,
  });
}
