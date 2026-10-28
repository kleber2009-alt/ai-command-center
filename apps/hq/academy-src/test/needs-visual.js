// «Что понадобится»: приветствие → окно по модулям → назад без потери ввода → шаг 0.1 → трек → модуль 2; плюс телефон
const { chromium } = require('playwright');
const path = require('path');
const URL = /^https?:/.test(process.argv[2]) ? process.argv[2] : 'file://' + path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  for (const [name, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const p = await (await b.newContext({ viewport: vp, deviceScaleFactor: name === 'phone' ? 2 : 1 })).newPage();
    p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction(() => window.OFFICE && window.OFFICE.sync, null, { timeout: 120000 });
    await p.waitForSelector('#aOnb');
    await p.fill('#aon-name', 'Анна'); await p.fill('#aon-project', 'Школа «Speak»');
    await p.evaluate(() => document.querySelector('#aModal .needs').scrollIntoView());
    await p.screenshot({ path: OUT + '/50-onb-needs-' + name + '.png' });
    await click(p, '#aModal [data-act="needs"]'); await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/51-needs-all-' + name + '.png', fullPage: false });
    const mods = await p.$$eval('#aModal .stk > .eb', (els) => els.map((e) => e.textContent));
    await click(p, '#aModal [data-act="onb"]'); await p.waitForTimeout(300);
    const kept = await p.evaluate(() => [document.querySelector('#aon-name').value, document.querySelector('#aon-project').value]);
    if (kept[0] !== 'Анна' || kept[1] !== 'Школа «Speak»') errors.push(name + ': onboarding values lost ' + JSON.stringify(kept));
    await p.evaluate(() => document.querySelector('#aOnb').requestSubmit()); await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + '/52-step01-needs-' + name + '.png' });
    await click(p, '#aPanel .aph [data-act="track"]'); await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + '/53-track-' + name + '.png' });
    await click(p, '#aPanel [data-act="needs"][data-id="2"]'); await p.waitForTimeout(300);
    await p.screenshot({ path: OUT + '/54-needs-m2-' + name + '.png' });
    if (name === 'desk') console.log('sections:', mods.join(' | '));
    await p.context().close();
  }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await b.close();
})();
