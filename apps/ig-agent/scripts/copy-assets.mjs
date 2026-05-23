// Copies static admin UI + SQL migrations into dist/ after tsc.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here); // apps/ig-agent

const dirs = [
  ['src/admin/ui', 'dist/admin/ui'],
  ['src/db/migrations', 'dist/db/migrations'],
];

for (const [from, to] of dirs) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) {
    console.error(`copy-assets: missing source ${src}`);
    process.exit(1);
  }
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log(`copy-assets: ${from}/ → ${to}/`);
}
