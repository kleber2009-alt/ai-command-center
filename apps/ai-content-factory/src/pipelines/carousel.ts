// Carousel pipeline: rubric config → Claude-generated JSON + caption → rendered
// PNG slides → manifest (and optional Telegram delivery), all written under
// data/output/<slug>-ep<episode>-<timestamp>/.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getRubric } from '../lib/rubrics.js';
import { outputPath } from '../lib/paths.js';
import { generateCarousel } from '../generators/carousel.js';
import { generateCaption } from '../generators/caption.js';
import { renderCarousel } from '../renderers/carousel.js';
import { deliverToTelegram } from '../delivery/telegram.js';
import { formatCaption } from '../schemas/caption.js';
import type { Carousel } from '../schemas/carousel.js';
import { log } from '../lib/logger.js';

export interface CarouselPipelineOptions {
  slug: string;
  topic: string;
  episode: number;
  /** Skip Claude and render this pre-built carousel instead (testing / re-render). */
  fixture?: Carousel;
  /** Generate a caption. Defaults to true when generating, false for fixtures. */
  withCaption?: boolean;
  /** Push the rendered post to Telegram. */
  deliver?: boolean;
}

export interface CarouselPipelineResult {
  outDir: string;
  carouselJsonPath: string;
  slidePaths: string[];
  captionPath?: string;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function runCarouselPipeline(
  opts: CarouselPipelineOptions,
): Promise<CarouselPipelineResult> {
  const rubric = getRubric(opts.slug);
  const generating = !opts.fixture;

  const carousel =
    opts.fixture ??
    (await generateCarousel({ rubric, topic: opts.topic, episode: opts.episode }));

  const withCaption = opts.withCaption ?? generating;
  let captionText: string | undefined;
  if (withCaption) {
    const caption = await generateCaption({ topic: opts.topic || carousel.topic, format: 'carousel' });
    captionText = formatCaption(caption);
  }

  const outDir = outputPath(`${opts.slug}-ep${opts.episode}-${timestamp()}`);
  await mkdir(outDir, { recursive: true });

  const carouselJsonPath = join(outDir, 'carousel.json');
  await writeFile(carouselJsonPath, JSON.stringify(carousel, null, 2), 'utf8');

  let captionPath: string | undefined;
  if (captionText) {
    captionPath = join(outDir, 'caption.txt');
    await writeFile(captionPath, captionText, 'utf8');
  }

  const { slidePaths } = await renderCarousel(carousel, rubric, outDir);

  if (opts.deliver) {
    await deliverToTelegram({ slidePaths, caption: captionText });
  }

  log.info('Carousel pipeline complete', {
    slug: opts.slug,
    episode: opts.episode,
    slides: slidePaths.length,
    delivered: Boolean(opts.deliver),
    outDir,
  });

  return { outDir, carouselJsonPath, slidePaths, captionPath };
}
