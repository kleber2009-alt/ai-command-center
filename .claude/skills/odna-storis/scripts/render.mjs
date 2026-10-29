// «Одна сториз» — render 1080x1920 Instagram stories from <project>/stories.json.
// Usage: node render.mjs <project-dir> [id ...]
//   <project-dir>/stories.json   — { profile?, stories: [...] } (format: references/story-rules.md)
//   <project-dir>/photos/<NN>.*  — background photos, photos/avatar.* — round avatar
//   <project-dir>/out/story-NN.png — result
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(process.argv[2] || '.');
const only = process.argv.slice(3).map(Number);
const require = createRequire(path.join(projectDir, 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
}

const data = JSON.parse(fs.readFileSync(path.join(projectDir, 'stories.json'), 'utf8'));
const stories = Array.isArray(data) ? data : data.stories;
const profile = data.profile || {};
const outDir = path.join(projectDir, 'out');
fs.mkdirSync(outDir, { recursive: true });

const ACCENT = { orange: '#FF7A00', red: '#F2304B', blue: '#1A73E8' };
const GREEN = '#2FB24C';

function findPhoto(name) {
  if (!name) return null;
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG']) {
    const p = path.join(projectDir, 'photos', `${name}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function dataUrl(file) {
  const mime = /png$/i.test(file) ? 'png' : /webp$/i.test(file) ? 'webp' : 'jpeg';
  return `data:image/${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function rich(text) {
  return esc(text)
    .replace(/&lt;small&gt;(.*?)&lt;\/small&gt;/g, '<span class="small">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<b class="acc">$1</b>')
    .replace(/\+\+(.+?)\+\+/g, '<b class="green">$1</b>')
    .replace(/(AI|ИИ)-/g, '$1‑')
    .replace(/\n/g, '<br>');
}

function plate(p) {
  const cls = ['plate', p.kind, p.size === 's' ? 'sm' : '', p.big ? 'big' : '', p.wide ? 'wide' : ''].join(' ');
  const style = p.gap ? `style="margin-top:${p.gap}px"` : '';
  if (p.kind === 'link') return `<div class="plate link" ${style}><span>🔗</span>${esc(p.text)}</div>`;
  return `<div class="${cls}" ${style}><span>${rich(p.text)}</span></div>`;
}

function background(s) {
  const photo = findPhoto(s.photo);
  if (photo) {
    const url = dataUrl(photo);
    if (s.bgBlur) return `<div class="bg blur" style="background-image:url(${url})"></div><div class="shade dim"></div>`;
    if (!s.shift && !s.scale) return `<div class="bg" style="background-image:url(${url})"></div><div class="shade"></div>`;
    // Shifted photo: blurred copy fills the frame, the sharp one moves down so the face sits between plates.
    const h = Math.round(1920 * (s.scale || 1));
    return `<div class="bg blur" style="background-image:url(${url})"></div>
      <img class="shifted" src="${url}" style="height:${h}px;top:${s.shift || 0}px"><div class="shade"></div>`;
  }
  if (s.bg === 'card' && s.card) {
    const chips = (s.card.chips || []).map((c) => `<i>${esc(c)}</i>`).join('');
    return `<div class="bg navy"></div>
      <div class="card"><div class="kicker">${esc(s.card.kicker || '')}</div>
        <div class="cardtitle">${rich(s.card.title || '')}</div><div class="chips">${chips}</div></div>`;
  }
  if (s.bg === 'avatar') {
    const av = findPhoto('avatar');
    const img = av ? `style="background-image:url(${dataUrl(av)})"` : '';
    return `<div class="bg navy"></div><div class="avatar" ${img}>${av ? '' : 'аватар'}</div>
      <div class="date">${esc(s.caption || '')}</div>`;
  }
  if (s.bg === 'dark') return `<div class="bg navy"></div>`;
  return `<div class="bg placeholder"><div class="ph">ФОТО ${esc(s.photo || '')}<br><small>${esc(s.photoNote || '')}</small></div></div>`;
}

// Screenshot of real work (hq2 office, slides, sites) as a framed card between the plates.
function inset(s) {
  if (!s.inset) return '';
  const file = path.resolve(projectDir, s.inset);
  if (!fs.existsSync(file)) return '';
  const label = s.insetLabel ? `<div class="insetlabel">${esc(s.insetLabel)}</div>` : '';
  const pos = s.insetTop ? `style="top:${s.insetTop}px"` : 'data-auto="1"';
  return `<div class="insetwrap" ${pos}>${label}<img class="inset" src="${dataUrl(file)}" style="max-height:${s.insetHeight || 560}px"></div>`;
}

function profileCard() {
  const av = findPhoto('avatar');
  const bg = av ? `style="background:url(${dataUrl(av)}) center/cover"` : '';
  return `<div class="profile"><div class="pa" ${bg}></div><div>
    <div class="pn">${esc(profile.handle || '')} <span class="tick">✓</span></div>
    <div class="pd">${esc(profile.bio || '')}</div>
    <div class="ps"><b>${esc(profile.posts || '')}</b> posts&nbsp;&nbsp;&nbsp;<b>${esc(profile.followers || '')}</b> followers&nbsp;&nbsp;&nbsp;<b>${esc(profile.following || '')}</b> following</div></div></div>`;
}

function html(s) {
  const accent = ACCENT[s.accent || 'orange'] || s.accent;
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400..900;1,400..900&display=block">
  <style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1920px;overflow:hidden;background:#111}
  body{font-family:'Inter','Apple Color Emoji','Noto Color Emoji',sans-serif;color:#111;position:relative}
  .bg{position:absolute;inset:0;background-size:cover;background-position:center}
  .blur{filter:blur(18px) brightness(.85);transform:scale(1.08)}
  .shifted{position:absolute;left:50%;transform:translateX(-50%);-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 120px)}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,0) 30%,rgba(0,0,0,0) 60%,rgba(0,0,0,.25))}
  .dim{background:rgba(5,8,16,.28)}
  .placeholder{background:repeating-linear-gradient(135deg,#3a3f47 0 40px,#353a41 40px 80px);display:flex;align-items:center;justify-content:center}
  .ph{color:rgba(255,255,255,.35);font:600 54px Inter;text-align:center;line-height:1.3}.ph small{font-size:36px}
  .navy{background:radial-gradient(120% 70% at 50% 45%,#16233f 0%,#0b1224 55%,#070b16 100%)}
  .stack{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:22px;padding:0 60px}
  .top{top:270px}.bottom{bottom:330px}
  .plate{background:#fff;border-radius:14px;padding:20px 32px;text-align:center;max-width:960px;box-shadow:0 6px 24px rgba(0,0,0,.18)}
  .plate span{display:block}
  .acc{color:${accent}}.green{color:${GREEN}}
  .light{font:500 60px/1.18 Inter;letter-spacing:-.5px}
  .light.sm{font-size:46px}
  .light .acc{font-weight:600}
  .light .small{font-size:48px;font-weight:400}
  .heavy{font:italic 800 58px/1.15 Inter;letter-spacing:-.8px;border-radius:22px}
  .heavy.big{font-size:84px}
  .bold{font:700 62px/1.2 Inter;letter-spacing:-.6px;border-radius:22px}
  .dark{background:#000;color:#fff;font:500 46px/1.25 Inter;border-radius:6px}
  .dark .green{font-weight:600}
  .alert{background:#000;color:#fff;font:800 104px/1 Inter;letter-spacing:2px;padding:30px 56px;border-radius:18px}
  .yellow{background:#F7C231;font:500 46px/1.25 Inter}
  .plain{background:none;box-shadow:none;color:#fff;font:500 44px/1.35 Inter;padding:6px 10px}
  .wide{max-width:none;width:1080px;border-radius:0;margin:0 -60px}
  .link{display:flex;align-items:center;gap:16px;font:700 52px Inter;color:#1A73E8;border-radius:60px;padding:24px 54px}
  .card{position:absolute;left:150px;right:150px;top:770px;padding:44px 40px;border-radius:28px;
    background:linear-gradient(180deg,#14203a,#0c1428);border:1px solid rgba(120,150,255,.18);text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  .kicker{color:#8ea0c8;font:600 26px Inter;letter-spacing:6px;margin-bottom:26px}
  .cardtitle{color:#fff;font:900 66px/1.02 Inter;letter-spacing:-1px}.cardtitle .acc{color:#8fb2ff}
  .chips{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:34px}
  .chips i{font:600 28px Inter;font-style:normal;color:#cfe0ff;border:1px solid rgba(143,178,255,.45);border-radius:40px;padding:10px 22px}
  .avatar{position:absolute;left:50%;top:760px;width:380px;height:380px;margin-left:-190px;border-radius:50%;
    background:#2a3550 center/cover;border:8px solid #fff;display:flex;align-items:center;justify-content:center;color:#8ea0c8;font:600 40px Inter}
  .date{position:absolute;left:0;right:0;top:1180px;text-align:center;color:#8fb2ff;font:700 38px Inter;letter-spacing:4px}
  .profile{display:flex;gap:26px;align-items:center;background:#fff;border-radius:22px;padding:28px 36px;margin-top:30px}
  .pa{width:110px;height:110px;border-radius:50%;background:#c9a27a}
  .pn{font:700 38px Inter}.tick{display:inline-block;background:#3897F0;color:#fff;border-radius:50%;width:36px;height:36px;font-size:24px;text-align:center;line-height:36px}
  .pd{font:500 26px Inter;color:#333;margin:6px 0 10px}.ps{font:400 28px Inter;color:#333}
  .insetwrap{position:absolute;left:70px;right:70px;display:flex;flex-direction:column;align-items:center;gap:14px}
  .inset{max-width:940px;border-radius:26px;border:6px solid #fff;box-shadow:0 30px 80px rgba(0,0,0,.55);object-fit:cover}
  .insetlabel{background:#000;color:#fff;font:700 30px Inter;letter-spacing:3px;padding:10px 22px;border-radius:10px}
  </style></head><body>
  ${background(s)}
  ${inset(s)}
  <div class="stack top">${(s.top || []).map(plate).join('')}</div>
  <div class="stack bottom">${s.profile ? profileCard() : ''}${(s.bottom || []).map(plate).join('')}</div>
  </body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const s of stories) {
  if (only.length && !only.includes(s.id)) continue;
  // Offline (no Google Fonts) falls back to a locally installed Inter.
  await page.setContent(html(s), { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // Auto inset: fill the gap between the top and bottom plate stacks.
  await page.evaluate(() => {
    const wrap = document.querySelector('.insetwrap[data-auto]');
    if (!wrap) return;
    const top = document.querySelector('.stack.top').getBoundingClientRect();
    const bottom = document.querySelector('.stack.bottom').getBoundingClientRect();
    const from = (top.height ? top.bottom : 250) + 36, to = (bottom.height ? bottom.top : 1590) - 36;
    const label = wrap.querySelector('.insetlabel');
    const img = wrap.querySelector('img');
    img.style.maxHeight = `${to - from - (label ? label.offsetHeight + 14 : 0)}px`;
    wrap.style.top = `${from + Math.max(0, (to - from - wrap.offsetHeight) / 2)}px`;
  });
  const file = path.join(outDir, `story-${String(s.id).padStart(2, '0')}.png`);
  await page.screenshot({ path: file });
  console.log(file, s.photo && !findPhoto(s.photo) ? '(no photo — placeholder)' : '');
}
await browser.close();
