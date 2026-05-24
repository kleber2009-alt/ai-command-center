// Generates a validated Reels script JSON via Claude (opus — creative), grounded
// in the rubric prompt + the available footage tag catalog.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { callClaude } from './claude.js';
import { reelsSchema, REELS_CONTRACT, type ReelsScript } from '../schemas/reels.js';
import { loadPrompt } from '../lib/prompt.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { fromAppRoot, dataPath } from '../lib/paths.js';

export interface GenerateReelsOptions {
  rubric: RubricConfig;
  topic: string;
  /** RAG context block to ground generation, same shape as for carousels. */
  ragContext?: string;
}

const FALLBACK_FOOTAGE_TAGS = [
  'talking-head',
  'screen-cast',
  'b-roll-typing',
  'b-roll-coffee',
  'b-roll-city',
  'b-roll-laptop',
];

/** Loads the available footage tags. Returns the fallback list when the
 * catalog file is missing — Claude still gets sensible tag choices. */
async function loadFootageTags(): Promise<string[]> {
  const catalog = dataPath('assets', 'footage-tags.json');
  if (!existsSync(catalog)) return FALLBACK_FOOTAGE_TAGS;
  try {
    const raw = await readFile(catalog, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed as string[];
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tags?: unknown }).tags)) {
      return (parsed as { tags: string[] }).tags;
    }
  } catch {
    // fall through
  }
  return FALLBACK_FOOTAGE_TAGS;
}

export async function generateReelsScript(opts: GenerateReelsOptions): Promise<ReelsScript> {
  const tags = await loadFootageTags();
  const promptFile = fromAppRoot('data/prompts/reels-script.md');
  const template = await loadPrompt(promptFile, {
    rubric: `${opts.rubric.label} (${opts.rubric.formula})`,
    topic: opts.topic,
  });

  const tagsList = tags.map((t) => `  - ${t}`).join('\n');
  const rag = opts.ragContext ? `${opts.ragContext}\n\n` : '';
  const prompt = [
    template,
    '',
    rag,
    '## Доступные теги фрагментов',
    tagsList,
    '',
    '## Контракт вывода',
    REELS_CONTRACT,
  ].join('\n');

  // Few-shot examples (rubric.examplesFile) are reused as the cached system
  // prompt where available — same pattern as carousel generation.
  let system: string | undefined;
  if (opts.rubric.examplesFile) {
    try {
      system = await readFile(fromAppRoot(opts.rubric.examplesFile), 'utf8');
    } catch {
      system = undefined;
    }
  }

  return callClaude<ReelsScript>({
    prompt,
    system,
    outputSchema: reelsSchema,
    model: 'opus',
    maxTokens: 2048,
    temperature: 1,
  });
}
