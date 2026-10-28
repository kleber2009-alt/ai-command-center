const { chromium } = require('playwright');
const path = require('path');
const URL = /^https?:/.test(process.argv[2]) ? process.argv[2] : 'file://' + path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  const shot = (p, n) => p.screenshot({ path: OUT + '/' + n + '.png' });
  async function open(vp) {
    const ctx = await browser.newContext({ viewport: vp.v, deviceScaleFactor: vp.dpr || 1 });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(vp.n + ' ' + m.type() + ': ' + m.text().slice(0, 200)); });
    p.on('pageerror', (e) => errors.push(vp.n + ' pageerror: ' + e.message));
    p.on('requestfailed', (r) => errors.push(vp.n + ' reqfail: ' + r.url().slice(0, 120) + ' ' + (r.failure() || {}).errorText));
    const t0 = Date.now();
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction(() => window.OFFICE && window.OFFICE.sync, null, { timeout: 120000 });
    console.log(vp.n, 'office ready in', Date.now() - t0, 'ms');
    await p.waitForTimeout(800);
    return p;
  }
  try {
    const q = await open({ n: 'desk', v: { width: 1440, height: 900 } });
    await q.click('#aModal [data-act="demo"]'); await q.waitForTimeout(2500);
    await shot(q, '20-demo-plan');
    await q.evaluate(() => { const b = document.querySelector('#aPanel [data-act="open-step"]'); if (b) b.click(); }); await q.waitForTimeout(2500);
    await shot(q, '21-demo-sales-step');
    await q.evaluate(() => { document.querySelector('#aPanel [data-act="to-questions"]').click(); }); await q.waitForTimeout(300);
    await q.evaluate(() => { document.querySelector('#aPanel [data-act="dunno"]').click(); }); await q.waitForTimeout(300);
    await shot(q, '22-demo-questions-help');
    await q.evaluate(() => window.OFFICE.enter('marketing')); await q.waitForTimeout(2000);
    await q.click('#aPanel [data-act="panel-off"]'); await q.waitForTimeout(800);
    await shot(q, '23-demo-marketing-room');
    await q.click('#aHud [data-act="team"]'); await q.waitForTimeout(400);
    await shot(q, '24-demo-team');
    await q.keyboard.press('Escape');
    await q.click('#aHud [data-act="library"]'); await q.waitForTimeout(400);
    await shot(q, '25-demo-library');
    await q.keyboard.press('Escape');
    await q.evaluate(() => window.OFFICE.toPlan()); await q.waitForTimeout(1800);
    await shot(q, '26-demo-plan-nopanel');
    const r = await open({ n: 'mobile', v: { width: 390, height: 844 }, dpr: 2 });
    await shot(r, '30-m-onboarding');
    await r.click('#aModal [data-act="demo"]'); await r.waitForTimeout(2500);
    await shot(r, '31-m-demo');
    await r.evaluate(() => { const b = document.querySelector('#aPanel [data-act="open-step"]'); if (b) b.click(); }); await r.waitForTimeout(2500);
    await shot(r, '32-m-step');
    await r.evaluate(() => { document.querySelector('#aPanel [data-act="to-questions"]').click(); }); await r.waitForTimeout(300);
    await r.evaluate(() => { document.querySelector('#aPanel [data-act="dunno"]').click(); }); await r.waitForTimeout(300);
    await shot(r, '33-m-questions-help');
    await r.evaluate(() => { document.querySelector('#aPanel [data-act="panel-off"]').click(); }); await r.waitForTimeout(1500);
    await shot(r, '34-m-panel-off');
    await r.evaluate(() => { document.querySelector('#aHud [data-act="project"]').click(); }); await r.waitForTimeout(500);
    await shot(r, '35-m-project');
  } catch (e) { console.log('FAILED', e.message); }
  console.log(errors.length ? errors.slice(0, 30).join('\n') : 'no errors');
  await browser.close();
})();
