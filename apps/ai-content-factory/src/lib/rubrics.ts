// Loads and types the rubric registry (data/rubrics.json).

import { readFileSync } from 'node:fs';
import { dataPath } from './paths.js';

export interface RubricConfig {
  label: string;
  /** Tag shown top-right on every slide, e.g. "Нейросети | ИИ | Маркетинг". */
  categoryTag?: string;
  /** Accent colour for UI elements (headings, bullets, CTA keyword). */
  accent: string;
  /** Cover background colour when no hero photo is supplied. */
  coverBg?: string;
  /** Watermark handle, e.g. "@ilia.paliy". */
  handle: string;
  formula: string;
  /** Path (relative to package root) to the carousel prompt template. */
  promptFile: string;
  /** Path (relative to package root) to the few-shot examples file. */
  examplesFile?: string;
  musicMood?: string;
}

let cache: Record<string, RubricConfig> | null = null;

export function loadRubrics(): Record<string, RubricConfig> {
  if (!cache) {
    cache = JSON.parse(readFileSync(dataPath('rubrics.json'), 'utf8')) as Record<
      string,
      RubricConfig
    >;
  }
  return cache;
}

export function getRubric(slug: string): RubricConfig {
  const rubric = loadRubrics()[slug];
  if (!rubric) {
    const available = Object.keys(loadRubrics()).join(', ');
    throw new Error(`Unknown rubric "${slug}". Available: ${available}`);
  }
  if (rubric.formula.startsWith('TODO')) {
    throw new Error(`Rubric "${slug}" is still a scaffold stub (formula is TODO) — fill it first`);
  }
  return rubric;
}
