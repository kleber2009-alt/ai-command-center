#!/usr/bin/env node
/*
 * Film the real hq2 office (apps/hq-office) for this site: hero scrub video + stills.
 * Serves apps/hq-office over http, opens it with ?debug&theme=obsidian, hides the HUD,
 * drives the clock through a virtual performance.now so agents move exactly 1/fps per frame.
 *
 *   node hq-capture.js --out ../img [--video] [--stills] [--frames 160] [--ao]
 */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const A = {}; process.argv.slice(2).forEach((v, i, a) => { if (v.startsWith('--')) A[v.slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true; });
const ROOT = path.resolve(__dirname, '../../../apps/hq-office'), OUT = path.resolve(A.out || path.join(__dirname, '../img'));
const SCRUB = path.resolve(__dirname, '../../../.claude/skills/cinematic-site/scripts/scrub-video.sh');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json', '.mp4': 'video/mp4', '.css': 'text/css', '.svg': 'image/svg+xml' };
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

// Camera moves (positions in office metres). Hero: high over the floor -> down to the founder's desk.
const V = (x, y, z) => ({ x, y, z });
const HERO = { pos: [V(-15, 19, 22), V(-8, 10, 15), V(-2.5, 4.4, 7), V(-3.6, 2.0, 2.6)], tgt: [V(-1, 0, -1), V(-3, 0.5, -3), V(-6, 1.5, -6.5), V(-8.4, 1.9, -8.6)] };

async function main() {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (w, h, pin) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      let vt = 0; const real = performance.now.bind(performance); window.__vt = { on: false, t: 0 };
      performance.now = () => window.__vt.on ? window.__vt.t : real();
      try { localStorage.setItem('hq:panel', '0'); } catch (e) {}
    });
    const p = await ctx.newPage(); p.on('pageerror', e => console.error('[hq]', e.message));
    await p.goto(`http://localhost:${port}/?debug${A.ao ? '' : '&noao'}&theme=obsidian`, { timeout: 120000 });
    await p.waitForFunction('window.__hq', null, { timeout: 120000 });
    await p.addStyleTag({ content: 'body *:not(#stage):not(#stage canvas){visibility:hidden!important}#stage,#stage canvas{visibility:visible!important}#loader{display:none!important}' });
    await p.evaluate(() => { const h = __hq; h.controls.enableDamping = false; window.__vt.t = performance.now(); window.__vt.on = true; h.step(6); });
    if (pin) await p.evaluate(() => { // stills: everyone back at their desk, at work
      for (const a of __hq.agents.values()) {
        if (!a.home || a.kind === 'orch') continue;
        a.x = a.home.x; a.z = a.home.z; a.yaw = a.tyaw = a.home.yaw; a.carrying = null; a.plan = [];
        a.act = { type: 'do', left: 1e9, pose: a.kind === 'head' ? 'sitType' : 'type', status: 'working', yaw: a.home.yaw };
      }
      __hq.step(2);
    });
    return p;
  };
  const frame = async (p, cam, dt) => p.evaluate(async ([c, dt]) => {
    const h = __hq; window.__vt.t += dt * 1000;
    h.camera.position.set(c.p.x, c.p.y, c.p.z); h.controls.target.set(c.t.x, c.t.y, c.t.z); h.controls.update();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, [cam, dt]);
  const cr = (pts, t) => { // catmull-rom through points
    const n = pts.length - 1, s = Math.min(n - 1e-6, t * n), i = Math.floor(s), u = s - i;
    const P = k => pts[Math.max(0, Math.min(n, k))], o = {};
    for (const a of ['x', 'y', 'z']) { const p0 = P(i - 1)[a], p1 = P(i)[a], p2 = P(i + 1)[a], p3 = P(i + 2)[a];
      o[a] = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u); }
    return o;
  };
  const ease = t => -(Math.cos(Math.PI * t) - 1) / 2;

  if (A.probe) { // print agents to plan shots
    const p = await open(800, 450);
    console.log(JSON.stringify(await p.evaluate(() => [...__hq.agents.values()].map(a => ({ id: a.id, kind: a.kind, dept: typeof a.dept === 'object' ? a.dept && a.dept.id : a.dept, x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2), hx: a.home && +a.home.x, hz: a.home && +a.home.z })))));
  }

  if (A.stills) {
    const shots = JSON.parse(fs.readFileSync(path.join(__dirname, A.shots || 'hq-shots.json'), 'utf8'));
    for (const [w, h, list] of [[1800, 1000, shots.wide], [1000, 1000, shots.square], [960, 1200, shots.portrait]]) {
      if (!list) continue; const p = await open(w, h, true);
      for (const s of list) {
        let cam = s;
        if (s.agent) cam = await p.evaluate(([id, d, hgt, side, ty, fwd]) => { // relative to the agent's facing (yaw)
          const a = __hq.agents.get(id); if (!a) return null;
          const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), sx = fz, sz = -fx;
          return { p: { x: a.x + fx * d + sx * side, y: hgt, z: a.z + fz * d + sz * side }, t: { x: a.x + fx * fwd, y: ty, z: a.z + fz * fwd } };
        }, [s.agent, s.d ?? 2.4, s.y ?? 1.75, s.side ?? 0.8, s.ty ?? 1.3, s.fwd ?? 0]);
        if (!cam) { console.log('skip', s.name); continue; }
        await frame(p, cam, 1 / 30); await frame(p, cam, 1 / 30);
        await p.screenshot({ path: path.join(OUT, s.name + '.jpg'), type: 'jpeg', quality: 88 }); console.log('still', s.name);
      }
      await p.context().close();
    }
  }

  if (A.video) {
    const N = +A.frames || 160, fps = 32, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-'));
    const p = await open(1280, 720);
    for (let i = 0; i < N; i++) {
      const e = ease(i / (N - 1));
      await frame(p, { p: cr(HERO.pos, e), t: cr(HERO.tgt, e) }, 1 / fps);
      await p.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
      if (i % 20 === 0) console.log('frame', i);
    }
    fs.copyFileSync(path.join(tmp, 'f0000.jpg'), path.join(OUT, 'hero-poster.jpg'));
    execFileSync('bash', [SCRUB, '--frames', path.join(tmp, 'f%04d.jpg'), '--fps', String(fps), path.join(OUT, 'hero-scrub.mp4')], { stdio: 'inherit' });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  await b.close(); server.close();
}
main().catch(e => { console.error(e); process.exit(1); });
