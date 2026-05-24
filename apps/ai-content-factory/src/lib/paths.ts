// Resolve data/ and output/ relative to the package root, independent of the
// process CWD. Works for both tsx (src/lib) and compiled dist (dist/lib): both
// sit two levels under the package root.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(here, '../..');

export const dataPath = (...segments: string[]): string =>
  resolve(APP_ROOT, 'data', ...segments);

export const outputPath = (...segments: string[]): string =>
  resolve(APP_ROOT, 'data', 'output', ...segments);

export const knowledgePath = (...segments: string[]): string =>
  resolve(APP_ROOT, 'data', 'knowledge', ...segments);

// Resolve a path stored in rubrics.json (relative to package root, e.g.
// "data/prompts/carousel-hood.md") to an absolute path.
export const fromAppRoot = (relative: string): string => resolve(APP_ROOT, relative);
