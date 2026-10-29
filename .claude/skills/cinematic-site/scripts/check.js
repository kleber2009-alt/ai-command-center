#!/usr/bin/env node
/*
 * QA pass for a built site: desktop + phone full-page screenshots, console errors,
 * broken images, horizontal overflow. Reveal animations are forced visible.
 *   node check.js <site_dir> <out_dir> [page.html ...]   (default: every *.html in site_dir)
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [site, out, ...pages] = process.argv.slice(2);
if (!site || !out) { console.error('usage: check.js <site_dir> <out_dir> [pages]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const list = pages.length ? pages : fs.readdirSync(site).filter(f => f.endsWith('.html'));
let bad = 0;
(async () => {
  const b = await chromium.launch();
  for (const p of list) for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: tag === 'phone', hasTouch: tag === 'phone' });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('intro_seen', '1'); } catch (e) {} });
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    pg.on('requestfailed', r => { if (!/api\/notify|supabase/.test(r.url())) errs.push('failed: ' + r.url()); });
    await pg.goto('file://' + path.resolve(site, p.split('?')[0]) + (p.includes('?') ? '?' + p.split('?')[1] : ''));
    await pg.waitForTimeout(1500);
    await pg.evaluate(async () => { document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); await new Promise(r => setTimeout(r, 1200)); });
    await pg.addStyleTag({ content: '.rvl{opacity:1!important;transform:none!important;transition:none!important}.tmt{animation:none!important}' });
    const r = await pg.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      broken: [...document.images].filter(i => i.complete && i.getAttribute('src') && !i.naturalWidth).map(i => i.getAttribute('src')),
    }));
    if (r.overflow > 1) errs.push(`horizontal overflow ${r.overflow}px`);
    if (r.broken.length) errs.push('broken images: ' + r.broken.join(', '));
    await pg.screenshot({ path: path.join(out, `${p.replace(/[^\w.-]/g, '_')}.${tag}.png`), fullPage: true });
    console.log((errs.length ? '✗ ' : '✓ ') + p + ' ' + tag + (errs.length ? '\n   ' + errs.join('\n   ') : ''));
    bad += errs.length; await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
