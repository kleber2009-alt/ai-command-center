// «Сегодня» и «Неделя офиса»: 11 нанятых агентов → кого запустить сегодня → отметка «сделано» → неделя; плюс телефон
const { chromium } = require('playwright');
const path = require('path');
const URL = /^https?:/.test(process.argv[2]) ? process.argv[2] : 'file://' + path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const hired = ['0.1', '0.2', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6'];
const seed = { v: 2, profile: { name: 'Анна', project: 'Школа «Speak»', goal: 'content', started: Date.now() }, xp: 1200, steps: {}, badges: ['office-open', 'first-agent'],
  streak: { count: 1, last: null, best: 1, days: [], freezeWeek: null }, heads: {}, guideAt: '3.1', created: Date.now() };
hired.forEach((id) => { seed.steps[id] = { seen: true, answered: true, giftsTaken: true, regSaved: true, hired: true }; });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  for (const [name, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: name === 'phone' ? 2 : 1 });
    await ctx.addInitScript((s) => localStorage.setItem('academy:v2', s), JSON.stringify(seed));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction(() => window.OFFICE && window.OFFICE.sync, null, { timeout: 120000 });
    await p.waitForTimeout(800);
    if (name === 'desk') await p.screenshot({ path: OUT + '/80-track-today.png' });
    if (!(await p.$('#aHud [data-act="today"]'))) errors.push(name + ': no «Сегодня» in HUD');
    await click(p, '#aHud [data-act="today"]'); await p.waitForTimeout(300);
    const cards = await p.$$eval('#aModal .run', (els) => els.length);
    console.log(name, 'today cards:', cards);
    if (cards) {
      await click(p, '#aModal .run [data-act="run-done"]'); await p.waitForTimeout(300);
      const done = await p.$$eval('#aModal .run.done', (els) => els.length);
      if (done < 1) errors.push(name + ': run-done did not mark the card');
    }
    await p.screenshot({ path: OUT + '/81-today-' + name + '.png' });
    await click(p, '#aModal [data-act="week"]'); await p.waitForTimeout(300);
    const cols = await p.$$eval('#aModal .wkd', (els) => els.map((e) => e.querySelectorAll('.chip').length));
    console.log(name, 'week chips per day:', cols.join(' '));
    if (cols.length !== 7) errors.push(name + ': week grid has ' + cols.length + ' days');
    await p.screenshot({ path: OUT + '/82-week-' + name + '.png' });
    await ctx.close();
  }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await b.close();
})();
