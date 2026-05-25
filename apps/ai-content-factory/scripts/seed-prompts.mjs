// Seeds 30 placeholder .md files into data/assets/prompts/<slot>/, one per
// catalog entry. Each stub uses the slot's label + description as starter
// content so the cabinet shows something usable right away.
//
// Usage (inside the container):
//   docker exec ai-content-factory node /app/scripts/seed-prompts.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CATALOG = '/app/data/assets/prompts-tags.json';
const ROOT = '/app/data/assets/prompts';

const cat = JSON.parse(readFileSync(CATALOG, 'utf8'));
const ts = Date.now();

let count = 0;
for (const entry of cat.tags ?? []) {
  const tag = entry.tag;
  const label = entry.label ?? tag;
  const desc = entry.description ?? '';
  const dir = join(ROOT, tag);
  mkdirSync(dir, { recursive: true });
  const file = `${ts}-placeholder.md`;
  const body =
    `# ${label}\n\n` +
    `> Заглушка. Замени содержимое — Claude увидит этот файл как RAG-контекст при генерации.\n\n` +
    `## Задумка слота\n\n${desc}\n\n` +
    `## Заполни:\n\n- (пример 1)\n- (пример 2)\n- (антипаттерн / стоп-лист)\n`;
  writeFileSync(join(dir, file), body, 'utf8');
  count++;
  console.log(`  prompt ${tag} → ${join(dir, file)}`);
}
console.log(`Seeded ${count} prompt stubs.`);
