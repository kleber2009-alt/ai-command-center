// CLI: generate + render a carousel.
//
//   npm run carousel -- --rubric hood --topic "Тема" --episode 7
//   npm run carousel -- --rubric hood --fixture tests/fixtures/hood-sample.json
//
// --fixture renders an existing Carousel JSON without calling Claude (no API key
// needed) — handy for iterating on the renderer.

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { runCarouselPipeline } from '../pipelines/carousel.js';
import { fromAppRoot } from '../lib/paths.js';
import type { Carousel } from '../schemas/carousel.js';
import { log } from '../lib/logger.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      rubric: { type: 'string' },
      topic: { type: 'string' },
      episode: { type: 'string', default: '1' },
      fixture: { type: 'string' },
    },
  });

  if (!values.rubric) {
    throw new Error('--rubric is required (e.g. --rubric hood)');
  }
  const episode = Number(values.episode);
  if (!Number.isFinite(episode)) {
    throw new Error(`--episode must be a number, got "${values.episode}"`);
  }

  let fixture: Carousel | undefined;
  if (values.fixture) {
    fixture = JSON.parse(await readFile(fromAppRoot(values.fixture), 'utf8')) as Carousel;
  } else if (!values.topic) {
    throw new Error('--topic is required unless --fixture is provided');
  }

  const result = await runCarouselPipeline({
    slug: values.rubric,
    topic: values.topic ?? fixture?.topic ?? '',
    episode,
    fixture,
  });

  log.info('Done', { outDir: result.outDir });
  for (const p of result.slidePaths) log.info(`  slide → ${p}`);
}

main().catch((err) => {
  log.error('Carousel CLI failed', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
