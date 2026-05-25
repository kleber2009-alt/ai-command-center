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
import { getDb } from '../db/index.js';
import { retrieveContext, type RagContext } from '../knowledge/retrieve.js';
import { formatRagContext } from '../knowledge/context.js';
import { logGeneration } from '../knowledge/store.js';
import type { Carousel } from '../schemas/carousel.js';
import type { ImageEngine } from '../renderers/image-engines.js';
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
  /** Ground generation in the knowledge base (RAG). Defaults to true when generating. */
  rag?: boolean;
  /** Which engine renders the slide PNGs. Default 'puppeteer'. */
  engine?: ImageEngine;
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

  // Retrieve knowledge-base context (RAG). Degrades gracefully: empty base or a
  // missing embeddings key simply means generation runs without grounding.
  let rag: RagContext | null = null;
  let ragText = '';
  if (generating && opts.rag !== false) {
    try {
      rag = await retrieveContext(getDb(), {
        topic: opts.topic,
        type: 'carousel',
        format: 'carousel',
      });
      ragText = formatRagContext(rag);
      if (rag) {
        log.info('RAG context retrieved', { good: rag.good.length, bad: rag.bad.length, learnings: rag.learnings.length });
      }
    } catch (err) {
      log.warn('RAG retrieval skipped', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  const carousel =
    opts.fixture ??
    (await generateCarousel({ rubric, topic: opts.topic, episode: opts.episode, ragContext: ragText }));

  const withCaption = opts.withCaption ?? generating;
  let captionText: string | undefined;
  if (withCaption) {
    const caption = await generateCaption({
      topic: opts.topic || carousel.topic,
      format: 'carousel',
      ragContext: ragText,
    });
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

  const { slidePaths } = await renderCarousel(carousel, rubric, outDir, opts.engine ?? 'puppeteer');

  if (generating) {
    try {
      logGeneration(getDb(), {
        inputContext: { slug: opts.slug, topic: opts.topic, episode: opts.episode, format: 'carousel' },
        retrievedExamples: rag
          ? { good: rag.good.map((e) => e.id), bad: rag.bad.map((e) => e.id) }
          : null,
        generatedOutput: { topic: carousel.topic, slides: carousel.slides.length, outDir },
        finalStatus: 'generated',
      });
    } catch (err) {
      log.warn('Generation log skipped', { error: err instanceof Error ? err.message : String(err) });
    }
  }

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
