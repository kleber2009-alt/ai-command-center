// Reels pipeline: rubric → Claude script JSON → optional FFmpeg render →
// caption → Telegram delivery (script-only when footage is missing).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getRubric } from '../lib/rubrics.js';
import { outputPath } from '../lib/paths.js';
import { generateReelsScript } from '../generators/reels-script.js';
import { generateCaption } from '../generators/caption.js';
import { renderReels } from '../renderers/reels-video.js';
import { deliverReelsToTelegram } from '../delivery/telegram.js';
import { formatCaption } from '../schemas/caption.js';
import { getDb } from '../db/index.js';
import { retrieveContext, type RagContext } from '../knowledge/retrieve.js';
import { formatRagContext } from '../knowledge/context.js';
import { logGeneration } from '../knowledge/store.js';
import { totalDuration, type ReelsScript } from '../schemas/reels.js';
import { log } from '../lib/logger.js';

export interface ReelsPipelineOptions {
  slug: string;
  topic: string;
  episode: number;
  /** Pre-built script for re-render / fixture mode. */
  fixture?: ReelsScript;
  withCaption?: boolean;
  deliver?: boolean;
  rag?: boolean;
}

export interface ReelsPipelineResult {
  outDir: string;
  mode: 'fallback' | 'video';
  scriptJsonPath: string;
  scriptMdPath: string;
  videoPath?: string;
  captionPath?: string;
  missingTags: string[];
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function runReelsPipeline(opts: ReelsPipelineOptions): Promise<ReelsPipelineResult> {
  const rubric = getRubric(opts.slug);
  const generating = !opts.fixture;

  // RAG (same shape as carousel).
  let rag: RagContext | null = null;
  let ragText = '';
  if (generating && opts.rag !== false) {
    try {
      rag = await retrieveContext(getDb(), {
        topic: opts.topic,
        type: 'reels',
        format: 'reels',
      });
      ragText = formatRagContext(rag);
      if (rag) log.info('RAG context retrieved', { good: rag.good.length, bad: rag.bad.length });
    } catch (err) {
      log.warn('RAG retrieval skipped', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  const script =
    opts.fixture ?? (await generateReelsScript({ rubric, topic: opts.topic, ragContext: ragText }));

  log.info('Reels script generated', {
    scenes: script.scenes.length,
    seconds: Math.round(totalDuration(script) + 3),
  });

  const withCaption = opts.withCaption ?? generating;
  let captionText: string | undefined;
  if (withCaption) {
    const caption = await generateCaption({
      topic: opts.topic,
      format: 'reels',
      ragContext: ragText,
    });
    captionText = formatCaption(caption);
  }

  const outDir = outputPath(`reels-${opts.slug}-ep${opts.episode}-${timestamp()}`);
  await mkdir(outDir, { recursive: true });

  const scriptJsonPath = join(outDir, 'reels.json');
  await writeFile(scriptJsonPath, JSON.stringify(script, null, 2), 'utf8');

  let captionPath: string | undefined;
  if (captionText) {
    captionPath = join(outDir, 'caption.txt');
    await writeFile(captionPath, captionText, 'utf8');
  }

  const render = await renderReels(script, rubric, outDir);

  if (generating) {
    try {
      logGeneration(getDb(), {
        inputContext: { slug: opts.slug, topic: opts.topic, episode: opts.episode, format: 'reels' },
        retrievedExamples: rag
          ? { good: rag.good.map((e) => e.id), bad: rag.bad.map((e) => e.id) }
          : null,
        generatedOutput: {
          topic: opts.topic,
          scenes: script.scenes.length,
          seconds: Math.round(totalDuration(script) + 3),
          mode: render.mode,
          outDir,
        },
        finalStatus: 'generated',
      });
    } catch (err) {
      log.warn('Generation log skipped', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (opts.deliver) {
    await deliverReelsToTelegram({
      mode: render.mode,
      videoPath: render.videoPath,
      scriptMdPath: render.scriptPath,
      caption: captionText,
      missingTags: render.missingTags,
    });
  }

  log.info('Reels pipeline complete', {
    slug: opts.slug,
    episode: opts.episode,
    mode: render.mode,
    delivered: Boolean(opts.deliver),
    outDir,
  });

  return {
    outDir,
    mode: render.mode,
    scriptJsonPath,
    scriptMdPath: render.scriptPath,
    videoPath: render.videoPath,
    captionPath,
    missingTags: render.missingTags,
  };
}
