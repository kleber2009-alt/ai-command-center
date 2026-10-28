// перенос прогресса: браузер А скачивает файл → чистый браузер Б загружает его с экрана приветствия; плохой файл — отказ
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = /^https?:/.test(process.argv[2]) ? process.argv[2] : 'file://' + path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const seed = { v: 2, profile: { name: 'Анна', project: 'Школа «Speak»', niche: 'английский', started: Date.now() }, xp: 330,
  steps: { '0.1': { seen: true, answered: true, hired: true }, '0.2': { seen: true, answered: true, hired: true }, '1.1': { seen: true, answered: true, hired: true }, '1.2': { seen: true, answers: { goal: 'черновик' } } },
  badges: ['office-open', 'first-agent'], streak: { count: 2, last: null, best: 2, days: [], freezeWeek: null }, heads: {}, guideAt: '1.2', created: Date.now() };
async function open(b, init) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  if (init) await ctx.addInitScript((s) => localStorage.setItem('academy:v2', s), JSON.stringify(init));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.OFFICE && window.OFFICE.sync, null, { timeout: 120000 });
  return p;
}
const errors = [];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  // А: есть прогресс → «Перенести» → скачать файл
  const a = await open(b, seed);
  await click(a, '#aPanel [data-act="transfer"]'); await a.waitForTimeout(300);
  await a.screenshot({ path: OUT + '/60-transfer-from.png' });
  const [dl] = await Promise.all([a.waitForEvent('download'), click(a, '#aModal [data-act="prog-file"]')]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('file', dl.suggestedFilename(), 'app', saved.app, 'steps', Object.keys(saved.state.steps).length);
  // Б: чистый браузер → приветствие → загрузить прогресс
  const p = await open(b, null);
  await p.waitForSelector('#aOnb');
  await p.fill('#aon-name', 'Черновик');
  await click(p, '#aModal [data-act="transfer"]'); await p.waitForTimeout(300);
  await p.setInputFiles('#aprog-file', file); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '/61-transfer-confirm.png' });
  await click(p, '#aModal [data-act="prog-ok"]'); await p.waitForTimeout(1200);
  const head = await p.$eval('#aPanel .aph .ttl', (e) => e.textContent);
  console.log('after import:', head);
  if (!/Speak/.test(head) || !/3 из 26/.test(head)) errors.push('import did not restore progress: ' + head);
  await p.screenshot({ path: OUT + '/62-transfer-done.png' });
  // плохой текст — отказ без замены
  await click(p, '#aPanel [data-act="transfer"]'); await p.waitForTimeout(300);
  await p.fill('#aprog-text', '{"hello":1}');
  await click(p, '#aModal [data-act="prog-load"]'); await p.waitForTimeout(400);
  const toast = await p.$eval('#aToasts', (e) => e.textContent);
  if (!/не файл прогресса/.test(toast)) errors.push('bad file not rejected: ' + toast);
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await b.close();
})();
