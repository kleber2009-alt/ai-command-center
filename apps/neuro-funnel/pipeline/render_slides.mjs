#!/usr/bin/env node
// Render lesson slides to PNG 1248x1080 (right 65% of the lesson frame):  node render_slides.mjs ../lessons/01
// Reads <lesson>/lesson.json, writes <lesson>/build/slides/NN.png. Slides with "full": true render 1920x1080 (cutaway).
// Image paths in img / imgs[].src are relative to the lesson folder.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || '.');
const lesson = JSON.parse(fs.readFileSync(path.join(dir, 'lesson.json'), 'utf8'));
const out = path.join(dir, 'build', 'slides');
const abs = p => (p && !/^(https?|file|data):/.test(p)) ? pathToFileURL(path.resolve(dir, p)).href : p;
for (const s of lesson.slides) {
  if (s.img) s.img = abs(s.img);
  for (const x of s.imgs || []) x.src = abs(x.src);
}
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'slides.html')).href);
const total = await page.evaluate(l => window.renderLesson(l), lesson);
for (let i = 1; i <= total; i++) {
  const el = page.locator(`section[data-i="${i}"]`);
  const file = path.join(out, `${String(i).padStart(2, '0')}.png`);
  await el.screenshot({ path: file });
  console.log(file);
}
await browser.close();
