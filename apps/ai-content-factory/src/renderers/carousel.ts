// Renders a Carousel to PNG slides. Default engine is Puppeteer (HTML → screenshot).
// Two image-gen engines are pluggable in parallel — see image-engines.ts:
//   - 'nano-banana' → Google Gemini Image
//   - 'gpt-image'   → OpenAI gpt-image-1

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';
import type { Carousel } from '../schemas/carousel.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { renderSlideHtml, SLIDE_WIDTH, SLIDE_HEIGHT, type RenderContext } from './templates.js';
import { log } from '../lib/logger.js';
import {
  type ImageEngine,
  renderSlideImage,
  type SlideRenderContext,
} from './image-engines.js';

export interface RenderResult {
  slidePaths: string[];
  engine: ImageEngine;
}

export async function renderCarousel(
  carousel: Carousel,
  rubric: RubricConfig,
  outDir: string,
  engine: ImageEngine = 'puppeteer',
): Promise<RenderResult> {
  await mkdir(outDir, { recursive: true });
  const total = carousel.slides.length;

  if (engine === 'puppeteer') {
    return renderWithPuppeteer(carousel, rubric, outDir, total);
  }

  // Image-gen engines: render each slide independently. Sequential to honour
  // provider rate-limits.
  const slidePaths: string[] = [];
  for (let index = 0; index < total; index++) {
    const slide = carousel.slides[index]!;
    const ctx: SlideRenderContext = { rubric, index, total };
    const buffer = await renderSlideImage(engine, slide, ctx);
    const file = join(outDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
    await writeFile(file, buffer);
    slidePaths.push(file);
  }
  log.info(`Rendered ${slidePaths.length} slides via ${engine}`, { outDir });
  return { slidePaths, engine };
}

async function renderWithPuppeteer(
  carousel: Carousel,
  rubric: RubricConfig,
  outDir: string,
  total: number,
): Promise<RenderResult> {
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });

    const slidePaths: string[] = [];
    for (let index = 0; index < total; index++) {
      const slide = carousel.slides[index]!;
      const ctx: RenderContext = { rubric, index, total };
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, deviceScaleFactor: 2 });
        await page.setContent(renderSlideHtml(slide, ctx), { waitUntil: 'load' });
        const file = join(outDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
        const buffer = await page.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
        });
        await writeFile(file, buffer);
        slidePaths.push(file);
      } finally {
        await page.close();
      }
    }

    log.info(`Rendered ${slidePaths.length} slides via puppeteer`, { outDir });
    return { slidePaths, engine: 'puppeteer' };
  } finally {
    await browser?.close();
  }
}
