// Aggregates the training tab into one big context block used as a CACHED
// system prompt for carousel (and later reels) generation:
//   - all .md files in data/assets/prompts/<slot>/
//   - all reference descriptions from data/assets/references/<slot>/.meta.json
//
// One ~25-50 KB block. Anthropic prompt caching makes the first call expensive
// (full input bill) and every subsequent call ~10× cheaper for that block.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dataPath } from './paths.js';

const PROMPTS_ROOT = dataPath('assets', 'prompts');
const REFS_ROOT = dataPath('assets', 'references');
const SAFE_TAG = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const TEXT_RE = /\.(md|txt|markdown)$/i;

interface RefMeta {
  description?: string;
  autoTags?: string[];
  status?: string;
}

/** Rubric-specific slots look like `prompt-08-rubric-diary` /
 * `prompt-09-rubric-hood` etc. Only the slot matching the current rubric
 * survives; others are dropped to keep the prompt small. Format-specific
 * slots follow `prompt-NN-format-FORMAT` (carousel | reels). */
function isExcludedByRubric(slot: string, rubricSlug?: string): boolean {
  const m = slot.match(/^prompt-\d+-rubric-(.+)$/i);
  if (!m) return false;
  if (!rubricSlug) return false;
  return m[1]!.toLowerCase() !== rubricSlug.toLowerCase();
}

function isExcludedByFormat(slot: string, format?: 'carousel' | 'reels'): boolean {
  // prompt-23-caption-formula stays (it's universal).
  // prompt-24-reels-script is reels-specific.
  if (!format) return false;
  if (format === 'carousel' && slot === 'prompt-24-reels-script') return true;
  return false;
}

interface ContextOpts {
  rubricSlug?: string;
  format?: 'carousel' | 'reels';
}

function loadPromptsBlock(opts: ContextOpts = {}): string {
  if (!existsSync(PROMPTS_ROOT)) return '';
  const slots = readdirSync(PROMPTS_ROOT)
    .filter((d) => {
      try { return statSync(join(PROMPTS_ROOT, d)).isDirectory() && SAFE_TAG.test(d); }
      catch { return false; }
    })
    .filter((slot) => !isExcludedByRubric(slot, opts.rubricSlug))
    .filter((slot) => !isExcludedByFormat(slot, opts.format))
    .sort();
  const sections: string[] = [];
  for (const slot of slots) {
    const dir = join(PROMPTS_ROOT, slot);
    const files = readdirSync(dir).filter((f) => TEXT_RE.test(f)).sort();
    for (const file of files) {
      try {
        const body = readFileSync(join(dir, file), 'utf8').trim();
        if (!body) continue;
        sections.push(`### ${slot}\n\n${body}`);
      } catch { /* skip unreadable */ }
    }
  }
  return sections.join('\n\n---\n\n');
}

function loadReferencesBlock(): string {
  if (!existsSync(REFS_ROOT)) return '';
  const slots = readdirSync(REFS_ROOT)
    .filter((d) => {
      try { return statSync(join(REFS_ROOT, d)).isDirectory() && SAFE_TAG.test(d); }
      catch { return false; }
    })
    .sort();
  const lines: string[] = [];
  for (const slot of slots) {
    const metaPath = join(REFS_ROOT, slot, '.meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, RefMeta>;
      for (const entry of Object.values(meta)) {
        if (!entry?.description || entry.status !== 'ready') continue;
        const tags = entry.autoTags && entry.autoTags.length > 0 ? ` [${entry.autoTags.join(', ')}]` : '';
        lines.push(`- **${slot}**${tags}: ${entry.description}`);
        break; // one ref entry per slot is enough
      }
    } catch { /* skip */ }
  }
  return lines.join('\n');
}

// Keyed per (rubricSlug, format) so cache doesn't trash itself across rubrics.
const cached = new Map<string, { value: string; ts: number }>();
const TTL_MS = 60_000;

function cacheKey(opts: ContextOpts): string {
  return `${opts.rubricSlug ?? ''}::${opts.format ?? ''}`;
}

/** Returns one combined training block, filtered for the current rubric/format.
 * In-memory cached for 60 s per (rubricSlug, format) pair. */
export function loadTrainingContext(opts: ContextOpts = {}): string {
  const key = cacheKey(opts);
  const hit = cached.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;
  const prompts = loadPromptsBlock(opts);
  const refs = loadReferencesBlock();
  const parts: string[] = [];
  parts.push('# Training context for content generation');
  parts.push(
    'Below is the editor-curated training set for this channel — tone, hook formulas, ' +
      'rubric briefs, brandbook, visual references. Use it as the SOURCE OF TRUTH for ' +
      'style, voice, and visual decisions. Anything in this block overrides general ' +
      'common-knowledge defaults.',
  );
  if (opts.rubricSlug || opts.format) {
    parts.push(
      `> Filter active: rubric=${opts.rubricSlug ?? '*'}, format=${opts.format ?? '*'}. ` +
        'Other rubrics\' briefs are omitted to keep the prompt focused.',
    );
  }
  if (refs) {
    parts.push('## Visual reference catalog (style anchors)');
    parts.push('Each entry is a real slide example with the Vision-described technique:');
    parts.push(refs);
  }
  if (prompts) {
    parts.push('## Prompts library (text briefs)');
    parts.push(prompts);
  }
  const value = parts.join('\n\n');
  cached.set(key, { value, ts: Date.now() });
  return value;
}

/** Clear all cached variants (called when the user edits the library). */
export function resetTrainingContextCache(): void {
  cached.clear();
}
