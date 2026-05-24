// CLI: generate a reels script + optional FFmpeg render.
//
//   npm run reels -- --rubric hood --topic "Тема" --episode 7
//   npm run reels -- --rubric hood --fixture path/to/reels.json
//
// Without a footage library (data/assets/footage/<tag>/*.mp4) the pipeline
// degrades to fallback mode and writes only the script — same artefact you
// will get in Telegram.

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { runReelsPipeline } from '../pipelines/reels.js';
import { fromAppRoot } from '../lib/paths.js';
import type { ReelsScript } from '../schemas/reels.js';
import { log } from '../lib/logger.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      rubric: { type: 'string' },
      topic: { type: 'string' },
      episode: { type: 'string', default: '1' },
      fixture: { type: 'string' },
      deliver: { type: 'boolean', default: false },
      'no-rag': { type: 'boolean', default: false },
    },
  });

  if (!values.rubric) throw new Error('--rubric is required (e.g. --rubric hood)');
  const episode = Number(values.episode);
  if (!Number.isFinite(episode)) throw new Error(`--episode must be a number, got "${values.episode}"`);

  let fixture: ReelsScript | undefined;
  if (values.fixture) {
    fixture = JSON.parse(await readFile(fromAppRoot(values.fixture), 'utf8')) as ReelsScript;
  } else if (!values.topic) {
    throw new Error('--topic is required unless --fixture is provided');
  }

  const result = await runReelsPipeline({
    slug: values.rubric,
    topic: values.topic ?? '',
    episode,
    fixture,
    deliver: values.deliver,
    rag: !values['no-rag'],
  });

  log.info('Done', { outDir: result.outDir, mode: result.mode });
  log.info(`  script (md) → ${result.scriptMdPath}`);
  if (result.videoPath) log.info(`  video → ${result.videoPath}`);
  if (result.captionPath) log.info(`  caption → ${result.captionPath}`);
  if (result.missingTags.length > 0) {
    log.warn(`  missing footage tags: ${result.missingTags.join(', ')}`);
  }
}

main().catch((err) => {
  log.error('Reels CLI failed', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
