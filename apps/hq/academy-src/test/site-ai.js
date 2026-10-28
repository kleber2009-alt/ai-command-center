// ИИ-проверка на сайте через Worker: страница по http (wrangler dev), ученик с кодом сдаёт шаг 0.1.
// node test/site-ai.js http://127.0.0.1:8788/academy test/shots [ожидание: ai|fallback]
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2], OUT = path.resolve(process.argv[3]), WANT = process.argv[4] || 'fallback';
const seed = { v: 2, profile: { name: 'Анна', project: 'Школа «Speak»', niche: 'английский', goal: 'leads', code: 'tester-MGEJHD', started: Date.now() }, xp: 40,
  steps: { '0.1': { seen: true, answered: true, giftsTaken: true, answers: { products: 'Курс разговорного английского — 25 000 ₽', clients: 'Взрослые 25–40 лет, стесняются говорить' } } },
  badges: [], streak: { count: 1, last: null, best: 1, days: [], freezeWeek: null }, heads: {}, guideAt: '0.1', quick: { id: 'leads', result: 'готово', at: Date.now() }, created: Date.now() };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('academy:v2', s), JSON.stringify(seed));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.OFFICE && window.OFFICE.sync, null, { timeout: 120000 });
  await p.waitForTimeout(1200);
  const foot = await p.$eval('#aPanel .apf', (e) => e.textContent);
  console.log('footer:', foot.replace(/\s+/g, ' ').trim());
  if (!/ИИ-проверка включена/.test(foot)) errors.push('footer does not say the AI check is on');
  await p.evaluate(() => document.querySelector('#aPanel [data-act="open-step"][data-id="0.1"]').click()); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('#aPanel [data-act="stage"][data-k="work"]').click()); await p.waitForTimeout(400);
  await p.fill('[data-res="0.1"]', 'Создала проект «Школа Speak» в Claude, вставила инструкцию CLAUDE.md и загрузила context/business.md. Claude ответил, что знает мои продукты и клиентов.');
  await p.evaluate(() => document.querySelector('#aPanel [data-act="check"]').click());
  await p.waitForFunction(() => !document.querySelector('#aPanel .think'), null, { timeout: 90000 });
  await p.waitForTimeout(400);
  const box = await p.$eval('#aPanel .box.ok, #aPanel .box.amber, #aPanel .box.bad', (e) => e.textContent.replace(/\s+/g, ' ')).catch(() => '');
  const toast = await p.$eval('#aToasts', (e) => e.textContent);
  console.log('check:', box.slice(0, 160), '| toast:', toast.slice(0, 120));
  if (WANT === 'ai' && !/Проверил ИИ/.test(box)) errors.push('expected an AI check: ' + box);
  if (WANT === 'fallback' && (!/Проверка без ИИ/.test(box) || !/ИИ-проверка не ответила/.test(toast))) errors.push('expected a fallback with a toast: ' + box + ' / ' + toast);
  await p.screenshot({ path: OUT + '/95-site-ai-' + WANT + '.png' });
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await b.close();
})();
