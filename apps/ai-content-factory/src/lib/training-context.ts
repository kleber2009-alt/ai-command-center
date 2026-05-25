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

function loadPromptsBlock(): string {
  if (!existsSync(PROMPTS_ROOT)) return '';
  const slots = readdirSync(PROMPTS_ROOT)
    .filter((d) => {
      try { return statSync(join(PROMPTS_ROOT, d)).isDirectory() && SAFE_TAG.test(d); }
      catch { return false; }
    })
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

let cached: { value: string; ts: number } | null = null;
const TTL_MS = 60_000; // re-read every minute — training data evolves between calls

/** Returns one combined training block (prompts + reference descriptions).
 * In-memory cached for 60 s so a single carousel run doesn't hit disk 30 times. */
export function loadTrainingContext(): string {
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value;
  const prompts = loadPromptsBlock();
  const refs = loadReferencesBlock();
  const parts: string[] = [];
  parts.push('# Training context for content generation');
  parts.push(
    'Below is the editor-curated training set for this channel — tone, hook formulas, ' +
      'rubric briefs, brandbook, visual references. Use it as the SOURCE OF TRUTH for ' +
      'style, voice, and visual decisions. Anything in this block overrides general ' +
      'common-knowledge defaults.',
  );
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
  cached = { value, ts: Date.now() };
  return value;
}

/** Clear the cache (called from server when the user edits the library). */
export function resetTrainingContextCache(): void {
  cached = null;
}
