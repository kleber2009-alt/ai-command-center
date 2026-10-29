#!/usr/bin/env node
// Рендер слайдов «Карусели Люкс»: jobs.json из lux.build() → PNG 1080×1350 × LUX_SCALE (по умолчанию 3 → 3240×4050,
// как оригиналы Ильи в Instagram). Нужен Playwright с Chromium (npm i playwright).
//   node scripts/render.mjs out/jobs.json [фильтр-подстрока]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
const [jobsFile, only] = process.argv.slice(2);
if (!jobsFile) { console.error('usage: node scripts/render.mjs out/jobs.json [filter]'); process.exit(1); }
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
const scale = Number(process.env.LUX_SCALE || 3);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: scale });
let n = 0;
for (const [html, png] of jobs) {
  if (only && !html.includes(only)) continue;
  fs.mkdirSync(path.dirname(png), { recursive: true });
  await p.goto('file://' + html);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: png });
  n++;
}
await b.close();
console.log(`✓ ${n} slides, ${1080 * scale}×${1350 * scale}`);
