#!/usr/bin/env node
/*
 * Render a procedural three.js scene into site assets:
 *   - stills (one JPEG per shot)         -> <out>/<shot>.jpg
 *   - scroll-scrub hero video + poster   -> <out>/hero-scrub.mp4, <out>/hero-poster.jpg
 *
 * The scene page must expose: window.SCENE_READY, window.SHOTS (names),
 * window.renderAt(name, t) -> JPEG dataURL. See template/scene-example.html.
 *
 * Usage:
 *   node render-frames.js --scene path/scene.html --out site/img \
 *        [--stills wide,low,agent-max | all] [--video hero] [--frames 160] [--fps 32] \
 *        [--w 1280 --h 720] [--still-w 1200 --still-h 1200]
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const A = {};
process.argv.slice(2).forEach((v, i, a) => { if (v.startsWith('--')) A[v.slice(2)] = a[i + 1]; });
if (!A.scene || !A.out) { console.error('need --scene and --out'); process.exit(1); }
const out = path.resolve(A.out); fs.mkdirSync(out, { recursive: true });
const scrub = path.join(__dirname, 'scrub-video.sh');

async function open(browser, w, h) {
  const pg = await browser.newPage({ viewport: { width: w, height: h } });
  pg.on('pageerror', e => console.error('[scene]', e.message));
  await pg.goto('file://' + path.resolve(A.scene) + `?w=${w}&h=${h}`);
  await pg.waitForFunction('window.SCENE_READY === true', null, { timeout: 120000 });
  return pg;
}
const save = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  if (A.stills) {
    const sw = +A['still-w'] || 1200, sh = +A['still-h'] || 1200;
    const pg = await open(browser, sw, sh);
    let names = A.stills === 'all' ? await pg.evaluate('window.SHOTS') : A.stills.split(',');
    if (A.video) names = names.filter(n => n !== A.video);
    for (const n of names) { save(await pg.evaluate(([n]) => window.renderAt(n, 0), [n]), path.join(out, n + '.jpg')); console.log('still', n); }
    await pg.close();
  }

  if (A.video) {
    const w = +A.w || 1280, h = +A.h || 720, N = +A.frames || 160, fps = +A.fps || 32;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
    const pg = await open(browser, w, h);
    for (let i = 0; i < N; i++) {
      save(await pg.evaluate(([n, t]) => window.renderAt(n, t), [A.video, i / (N - 1)]), path.join(tmp, `f${String(i).padStart(4, '0')}.jpg`));
      if (i % 20 === 0) console.log('frame', i, '/', N);
    }
    await pg.close();
    fs.copyFileSync(path.join(tmp, 'f0000.jpg'), path.join(out, 'hero-poster.jpg'));
    execFileSync('bash', [scrub, '--frames', path.join(tmp, 'f%04d.jpg'), '--fps', String(fps), path.join(out, 'hero-scrub.mp4')], { stdio: 'inherit' });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  await browser.close();
})();
