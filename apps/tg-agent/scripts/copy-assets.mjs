// Copies non-TS runtime assets (markdown, sql, etc.) from src/ into
// dist/, preserving directory structure. Runs after `tsc`.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here); // apps/tg-agent

const assets = [
  ['src/knowledge/knowledge_base.md', 'dist/knowledge/knowledge_base.md'],
  ['src/admin/ui.html', 'dist/admin/ui.html'],
  ['src/admin/login.html', 'dist/admin/login.html'],
];

for (const [from, to] of assets) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) {
    console.error(`copy-assets: missing source ${src}`);
    process.exit(1);
  }
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
  console.log(`copy-assets: ${from} → ${to}`);
}
