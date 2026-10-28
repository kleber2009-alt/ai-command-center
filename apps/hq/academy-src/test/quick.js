// быстрая победа: вход с целью → окно с промптом под проект → ответ Claude → +опыт, файл wins/first-win.md, ресепшн; пропуск → блок в треке
const { chromium } = require('playwright');
const path = require('path');
const URL = /^https?:/.test(process.argv[2]) ? process.argv[2] : 'file://' + path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const errors = [];
async function start(b, goal) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.OFFICE && window.OFFICE.sync, null, { timeout: 120000 });
  await p.waitForSelector('#aOnb');
  await p.fill('#aon-name', 'Анна'); await p.fill('#aon-project', 'Школа «Speak»'); await p.fill('#aon-niche', 'учу взрослых говорить по-английски');
  await p.selectOption('#aon-goal', goal);
  await p.evaluate(() => document.querySelector('#aOnb').requestSubmit()); await p.waitForTimeout(900);
  return p;
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await start(b, 'content');
  const title = await p.$eval('#aModal .h2', (e) => e.textContent);
  const prompt = await p.$eval('#aModal .pre', (e) => e.textContent);
  console.log('quick win:', title, '| prompt has project:', /Speak/.test(prompt) && /по-английски/.test(prompt));
  if (!/рилсов/.test(title) || !/Speak/.test(prompt)) errors.push('quick win modal wrong: ' + title);
  await p.screenshot({ path: OUT + '/90-quick-win.png' });
  const xp0 = await p.$eval('#aHud .xp b', (e) => e.textContent);
  await p.fill('#aqw-res', '1. Хук: «Я выучил 300 слов за неделю — вот как». Пункты: карточки, повтор, разговор. Слово: СЛОВА\n2. …');
  await click(p, '#aModal [data-act="quick-done"]'); await p.waitForTimeout(1200);
  const xp1 = await p.$eval('#aHud .xp b', (e) => e.textContent);
  const step = await p.$eval('#aPanel .aph .ttl span', (e) => e.textContent);
  console.log('xp:', xp0, '→', xp1, '| step:', step);
  if (xp0 === xp1) errors.push('no xp for the quick win');
  if (!/Шаг 0\.1/.test(step)) errors.push('reception did not open: ' + step);
  await click(p, '#aHud [data-act="project"]'); await p.waitForTimeout(400);
  const files = await p.$$eval('#aModal .frow b', (els) => els.map((e) => e.textContent));
  console.log('files:', files.join(', '));
  if (!files.includes('wins/first-win.md')) errors.push('wins/first-win.md missing');
  // пропуск: окно закрыто, в треке остаётся предложение
  const q = await start(b, 'sales');
  await click(q, '#aModal [data-act="quick-skip"]'); await q.waitForTimeout(900);
  await click(q, '#aPanel .aph [data-act="track"]'); await q.waitForTimeout(400);
  const offer = await q.$$eval('#aPanel [data-act="quick"]', (els) => els.length);
  if (!offer) errors.push('no quick-win offer in the track after skip');
  await q.screenshot({ path: OUT + '/91-quick-offer.png' });
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await b.close();
})();
