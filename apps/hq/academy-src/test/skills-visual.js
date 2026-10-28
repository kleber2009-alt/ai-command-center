// визуальная проверка карточек скиллов: пример AICEX → «Решения», шаги 2.4 и 3.1 на этапе «Решение»
const { chromium } = require('playwright');
const path = require('path');
const URL = /^https?:/.test(process.argv[2]) ? process.argv[2] : 'file://' + path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.OFFICE && window.OFFICE.sync, null, { timeout: 120000 });
  await p.click('#aModal [data-act="demo"]'); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('#aHud [data-act="library"]').click()); await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '/40-library-skills.png' });
  await p.keyboard.press('Escape');
  for (const id of ['2.4', '3.1']) {
    await p.evaluate((id) => document.querySelector('#aPanel [data-act="open-step"][data-id="' + id + '"]').click(), id); await p.waitForTimeout(1200);
    await p.evaluate((id) => document.querySelector('#aPanel [data-act="stage"][data-id="' + id + '"][data-k="gifts"]').click(), id); await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + '/41-gifts-' + id + '.png' });
    await p.evaluate(() => document.querySelector('#aPanel [data-act="back"], #aPanel .aph .icob').click()); await p.waitForTimeout(600);
  }
  await p.evaluate(() => { const x = document.querySelector('#aPanel [data-act="open-step"][data-id="3.1"]'); x.click(); }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('#aPanel [data-act="stage"][data-id="3.1"][data-k="gifts"]').click()); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#aPanel [data-act="skill-code"]').click()); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/42-code-dialog.png' });
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await b.close();
})();
