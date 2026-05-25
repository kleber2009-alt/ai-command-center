// Generates a validated Reels script JSON via Claude (opus — creative).
// Two grounding modes:
//   1. Library mode — when data/assets/footage/<tag>/ has any clips with
//      .meta.json descriptions, we list ALL clips ("<tag>/<file>: description")
//      and ask Claude to pick one per scene. The renderer then uses scene.clipFile.
//   2. Tag-only mode — when the library is empty/un-described, fall back to
//      the original ТЗ behaviour: Claude picks an abstract footageTag and the
//      renderer randomly chooses a clip inside that tag (used by the fallback
//      script-only delivery path).

import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callClaude } from './claude.js';
import { reelsSchema, REELS_CONTRACT, type ReelsScript } from '../schemas/reels.js';
import { loadPrompt } from '../lib/prompt.js';
import type { RubricConfig } from '../lib/rubrics.js';
import { fromAppRoot, dataPath } from '../lib/paths.js';
import { loadTrainingContext } from '../lib/training-context.js';

export interface GenerateReelsOptions {
  rubric: RubricConfig;
  /** Rubric slug from the catalog — drives training-context filtering. */
  rubricSlug?: string;
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

const FILE_RE = /\.(mp4|mov|m4v|webm)$/i;

interface LibraryClip {
  tag: string;
  file: string;
  ref: string; // "<tag>/<file>"
  description?: string;
  autoTags?: string[];
  durationSec?: number;
}

/** Loads the available footage tags. Accepts three catalog shapes:
 *   1. ["tag1","tag2",...]                       — plain array of strings
 *   2. {"tags":["tag1","tag2",...]}              — wrapped strings
 *   3. {"tags":[{"tag":"tag1","label":"...",...}]} — rich objects
 * Returns the fallback list when the file is missing or malformed. */
async function loadFootageTags(): Promise<string[]> {
  const catalog = dataPath('assets', 'footage-tags.json');
  if (!existsSync(catalog)) return FALLBACK_FOOTAGE_TAGS;
  try {
    const raw = await readFile(catalog, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed as string[];
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tags?: unknown }).tags)) {
      const tags = (parsed as { tags: unknown[] }).tags;
      if (tags.every((t) => typeof t === 'string')) return tags as string[];
      if (tags.every((t) => t && typeof t === 'object' && typeof (t as { tag?: unknown }).tag === 'string')) {
        return (tags as { tag: string }[]).map((t) => t.tag);
      }
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_FOOTAGE_TAGS;
}

interface ClipMetaSnapshot {
  description?: string;
  autoTags?: string[];
  durationSec?: number;
  status?: string;
}

function loadClipsForTag(tag: string): LibraryClip[] {
  const dir = dataPath('assets', 'footage', tag);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  let meta: Record<string, ClipMetaSnapshot> = {};
  const metaFile = join(dir, '.meta.json');
  if (existsSync(metaFile)) {
    try {
      meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Record<string, ClipMetaSnapshot>;
    } catch {
      meta = {};
    }
  }
  return readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .map((f) => {
      const m = meta[f];
      return {
        tag,
        file: f,
        ref: `${tag}/${f}`,
        description: m?.description,
        autoTags: m?.autoTags,
        durationSec: m?.durationSec,
      };
    });
}

function loadLibrary(tags: string[]): LibraryClip[] {
  const all: LibraryClip[] = [];
  for (const t of tags) all.push(...loadClipsForTag(t));
  return all;
}

export async function generateReelsScript(opts: GenerateReelsOptions): Promise<ReelsScript> {
  const tags = await loadFootageTags();
  const library = loadLibrary(tags);
  const promptFile = fromAppRoot('data/prompts/reels-script.md');
  const template = await loadPrompt(promptFile, {
    rubric: `${opts.rubric.label} (${opts.rubric.formula})`,
    topic: opts.topic,
  });

  const tagsList = tags.map((t) => `  - ${t}`).join('\n');
  const describedClips = library.filter((c) => c.description && c.description.length > 0);
  const rag = opts.ragContext ? `${opts.ragContext}\n\n` : '';

  // Two-mode prompt: rich library when described clips exist, else falls back to tags.
  let libraryBlock: string;
  if (describedClips.length > 0) {
    const lines = describedClips.map((c) => {
      const dur = c.durationSec ? ` · ~${c.durationSec.toFixed(1)} с` : '';
      const at = c.autoTags && c.autoTags.length > 0 ? ` · теги: ${c.autoTags.join(', ')}` : '';
      return `  - ${c.ref}${dur}${at}\n    ${c.description}`;
    });
    libraryBlock =
      `## Доступные клипы (${describedClips.length})\n\n` +
      `Подбирай clipFile из этого списка — по совпадению содержания со сценой. ` +
      `Один и тот же clipFile можно использовать в разных сценах, если он подходит.\n\n` +
      lines.join('\n');
  } else {
    libraryBlock =
      `## Доступные теги фрагментов\n\n` +
      tagsList +
      `\n\nБиблиотека описанных клипов пуста — используй footageTag вместо clipFile.`;
  }

  const prompt = [template, '', rag, libraryBlock, '', '## Контракт вывода', REELS_CONTRACT].join('\n');

  // Training context (filtered for this rubric + reels format) + few-shot
  // examples go into the cached system prompt — same pattern as carousel.
  const trainingBlock = loadTrainingContext({ rubricSlug: opts.rubricSlug, format: 'reels' });
  let fewShot: string | undefined;
  if (opts.rubric.examplesFile) {
    try {
      fewShot = await readFile(fromAppRoot(opts.rubric.examplesFile), 'utf8');
    } catch {
      fewShot = undefined;
    }
  }
  const system = [trainingBlock, fewShot].filter(Boolean).join('\n\n---\n\n') || undefined;

  return callClaude<ReelsScript>({
    prompt,
    system,
    outputSchema: reelsSchema,
    model: 'opus',
    maxTokens: 2048,
    temperature: 1,
  });
}
