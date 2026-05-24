// Carousel pipeline: rubric config → Claude-generated JSON → rendered PNG slides
// → manifest, all written under data/output/<slug>-ep<episode>-<timestamp>/.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getRubric } from '../lib/rubrics.js';
import { outputPath } from '../lib/paths.js';
import { generateCarousel } from '../generators/carousel.js';
import { renderCarousel } from '../renderers/carousel.js';
import type { Carousel } from '../schemas/carousel.js';
import { log } from '../lib/logger.js';

export interface CarouselPipelineOptions {
  slug: string;
  topic: string;
  episode: number;
  /** Skip Claude and render this pre-built carousel instead (testing / re-render). */
  fixture?: Carousel;
}

export interface CarouselPipelineResult {
  outDir: string;
  carouselJsonPath: string;
  slidePaths: string[];
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function runCarouselPipeline(
  opts: CarouselPipelineOptions,
): Promise<CarouselPipelineResult> {
  const rubric = getRubric(opts.slug);

  const carousel =
    opts.fixture ??
    (await generateCarousel({ rubric, topic: opts.topic, episode: opts.episode }));

  const outDir = outputPath(`${opts.slug}-ep${opts.episode}-${timestamp()}`);
  await mkdir(outDir, { recursive: true });

  const carouselJsonPath = join(outDir, 'carousel.json');
  await writeFile(carouselJsonPath, JSON.stringify(carousel, null, 2), 'utf8');

  const { slidePaths } = await renderCarousel(carousel, rubric, outDir);

  log.info('Carousel pipeline complete', {
    slug: opts.slug,
    episode: opts.episode,
    slides: slidePaths.length,
    outDir,
  });

  return { outDir, carouselJsonPath, slidePaths };
}
