// Renders a Carousel to a set of 1080×1350 PNG slides using headless Chromium.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';
import type { Carousel } from '../schemas/carousel.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { renderSlideHtml, SLIDE_WIDTH, SLIDE_HEIGHT, type RenderContext } from './templates.js';
import { log } from '../lib/logger.js';

export interface RenderResult {
  slidePaths: string[];
}

export async function renderCarousel(
  carousel: Carousel,
  rubric: RubricConfig,
  outDir: string,
): Promise<RenderResult> {
  await mkdir(outDir, { recursive: true });
  const total = carousel.slides.length;

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

    log.info(`Rendered ${slidePaths.length} slides`, { outDir });
    return { slidePaths };
  } finally {
    await browser?.close();
  }
}
