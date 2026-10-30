/* Ночной офис — второй стиль hq2.aicex.club («Ночной Сити», концепт ?v=1 из concepts/).
   Своя сцена: изометрическое здание с комнатами отделов, коридорами, ночным городом и тёплым светом.
   Своей симуляции нет: это вид на ту же команду, что в основном офисе (index.html). Каждый агент
   здесь повторяет, куда идёт его двойник в основной симуляции: к столу, к коллеге с материалом,
   к вашему столу на проверку, на перерыв, на планёрку, за материалами. Подписи, статусы и задачи
   берутся из основного офиса как есть — панели, рабочий стол и ассистент общие. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ───────────── Оформление ───────────── */
const T = {
  sky:['#060a17', '#1d1830'], win:['#ffcf7a', '#ffe2a8'], bld:'#0b0e18', fog:['#0d0f1a', .007],
  base:'#21170f', edge:'#ffb45c', floor:'#3b2a1e', roomFloor:'#5c3e27', hubFloor:'#47311f', rug:'#ffb45c',
  glass:['#ffd9a0', .1], frame:'#2b1e15', trim:['#ffb45c', 2.2], outer:'#1d140d', strip:'#ffcf8a',
  desk:'#7a5234', chair:'#1d1d22', sofa:'#d8cdb8', leaf:'#3f7a36', pot:'#2a2420', screenBg:'#0b1220',
  hemi:['#8090c0', '#2a1c12', .55], sun:['#ffd9b0', .9], lamp:['#ffb066', 16],
  bloom:[.75, .5, .72], exposure:1, sign:'#fff1d6', accent:'#ffb45c',
};

/* ───────────── Планировка ─────────────
   r — [x0, z0, x1, z1]; двери — [сторона, координата вдоль стены]. Выход из двери лежит на коридоре.
   desks — где стоят столы агентов комнаты: ряды от zA до zB, до cols столов в ряду, не больше rows рядов.
   Кто не поместился — садится в операционный зал (OVERFLOW), так офис растёт вместе с командой. */
const ICON = {
  crown:'<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
  sofa:'<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"/><path d="M4 18v2M20 18v2"/>',
  coffee:'<path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  megaphone:'<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  chart:'<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  board:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  chat:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  cpu:'<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  video:'<path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
const ROOMS = [
  { id:'ceo',       name:'Кабинет основателя', sub:'Ваш стол, стратегия и продукт',    icon:'crown',     r:[-22,-14,-11,-7.5], doors:[['s',-14]], dept:'ceo',
    desks:{ x0:-17.2, x1:-12.8, zA:-10.6, zB:-8.7, cols:3, rows:2 } },
  { id:'lounge',    name:'Лаунж',              sub:'Отдых и разговоры',                icon:'sofa',      r:[-11,-14,-1,-7.5],  doors:[['s',-6]] },
  { id:'kitchen',   name:'Кухня',              sub:'Кофе и новости',                   icon:'coffee',    r:[-1,-14,8,-7.5],    doors:[['s',3.5]] },
  { id:'meet',      name:'Переговорная',       sub:'Планёрки оркестратора',            icon:'users',     r:[8,-14,22,-7.5],    doors:[['s',14]] },
  { id:'marketing', name:'Маркетинг',          sub:'Креативы, воронки, лендинги',      icon:'megaphone', r:[-22,-5.5,-12,4],   doors:[['e',-.5]], dept:'marketing',
    desks:{ x0:-20.2, x1:-13.8, zA:-1.6, zB:2, cols:3, rows:3 }, head:[-17, -3.9] },
  { id:'analytics', name:'Аналитика',          sub:'Охваты, ROMI, аудитория',          icon:'chart',     r:[-22,5.5,-12,14],   doors:[['e',9]],
    desks:{ x0:-20, x1:-14, zA:8.6, zB:10.6, cols:3, rows:2 } },
  { id:'hub',       name:'Операционный зал',   sub:'Рабочий стол: задача → агент → проверка', icon:'board', r:[-10,-5.5,10,4], doors:[['n',-7],['w',-.5],['e',-.5],['s',0]], open:true },
  { id:'sales',     name:'Отдел продаж',       sub:'Директ, комментарии, сделки',      icon:'chat',      r:[12,-5.5,22,4],     doors:[['w',-.5]], dept:'sales',
    desks:{ x0:13.8, x1:20.2, zA:-1.6, zB:2, cols:3, rows:3 }, head:[17, -3.9] },
  { id:'tech',      name:'Технический отдел',  sub:'Продукты, скиллы, исполнитель',    icon:'cpu',       r:[12,5.5,22,14],     doors:[['w',9]],
    desks:{ x0:13.6, x1:18.4, zA:8.4, zB:11, cols:3, rows:2 } },
  { id:'studio',    name:'Контент-студия',     sub:'Сценарии, монтаж, аватар, карусели', icon:'video',   r:[-10,5.5,-.5,14],   doors:[['n',-5]],
    desks:{ x0:-9, x1:-5.6, zA:7.6, zB:10.6, cols:3, rows:2 } },
  { id:'ads',       name:'Реклама Meta',       sub:'Кампании и отчёты',                icon:'target',    r:[.5,5.5,10,14],     doors:[['n',5]], dept:'traffic',
    desks:{ x0:1.8, x1:4.6, zA:9, zB:11.4, cols:2, rows:2 }, head:[7.2, 8.6] },
];
const RM = Object.fromEntries(ROOMS.map(r => [r.id, r]));
const CORRIDORS = [[[-14,-6.5],[14,-6.5]], [[-11,-6.5],[-11,9]], [[11,-6.5],[11,9]], [[-11,5],[11,5]]];
// свободные места в операционном зале — для новых агентов, которым не хватило стола в комнате
const OVERFLOW = [[-4.6,2.3],[4.4,2.3],[-2.6,2.3],[2.4,2.3],[-7.6,-2.6],[7.4,-2.6],[-4.6,-.4],[4.4,-.4],[-7.6,-.6],[7.4,-.6],[-2.6,-3.4],[-4.6,-3.4]];
// комната агента: как в концепте; новые агенты — в комнату своего отдела
const ROOM_OF = {
  market:'ceo', briefing:'ceo', specs:'ceo',
  product:'tech', skills:'tech', runner:'tech',
  creatives:'marketing', funnels:'marketing', publish:'marketing', landings:'marketing', leadmagnet:'marketing', threads:'marketing',
  scripts:'studio', montage:'studio', carousel:'studio', avatar:'studio', slides:'studio',
  analytics:'analytics', audience:'analytics', adreports:'analytics',
  chats:'sales', comments:'sales', consult:'sales', mailings:'sales', closer:'sales',
  metaads:'ads', orchestrator:'hub',
};
const DEPT_ROOM = { ceo:'ceo', marketing:'marketing', sales:'sales', traffic:'ads' };
const OWNER_DESK = [-19.4, -12.3];

/* ───────────── Утилиты ───────────── */
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const svg = name => `<svg viewBox="0 0 24 24">${ICON[name]}</svg>`;
const FONT = "Manrope, system-ui, sans-serif";

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.canvas = c;
  return t;
}
function rr(x, X, Y, W, H, R) { x.beginPath(); x.roundRect(X, Y, W, H, R); x.fill(); }

/* ───────────── Сборка ─────────────
   o: { stage, labels, agents (Map основного офиса), depts, owner, brand, mobile, reduceMotion,
        statusColor(s), ownerLabel() — html подписи вашего стола, board() — { title, cols:[{ name, color, items:[{ title, who }] }] } для доски,
        follow() — id агента, за которым следит камера, selected() — выбранный id,
        onPick(id | 'you' | null) } */
export async function createNightOffice(o) {
  await document.fonts?.ready;
  const MATS = new Map(), GEO = {};
  function M(color, p = {}) {
    const key = color + JSON.stringify(p);
    if (MATS.has(key)) return MATS.get(key);
    let m;
    if (p.basic) m = new THREE.MeshBasicMaterial({ color, transparent:!!p.opacity, opacity:p.opacity ?? 1, toneMapped:p.toneMapped ?? true, side:p.side ?? THREE.FrontSide });
    else m = new THREE.MeshStandardMaterial({
      color, roughness:p.rough ?? .75, metalness:p.metal ?? 0,
      transparent:p.opacity != null, opacity:p.opacity ?? 1, depthWrite:p.opacity == null,
    });
    if (p.glow) m.color.multiplyScalar(p.glow);
    MATS.set(key, m);
    return m;
  }
  const rbox = (w, h, d, r = .04) => GEO[[w, h, d, r].join()] ||= new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
  function box(parent, w, h, d, mat, x, y, z, p = {}) {
    const m = new THREE.Mesh(p.round === false ? new THREE.BoxGeometry(w, h, d) : rbox(w, h, d, p.r ?? .04), mat);
    m.position.set(x, y, z);
    if (p.ry) m.rotation.y = p.ry;
    m.castShadow = p.shadow ?? true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(parent, rt, rb, h, mat, x, y, z, seg = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }

  /* ───────────── Рендер ───────────── */
  const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, o.mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = T.exposure;
  o.stage.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer({ element:o.labels });
  labelRenderer.setSize(innerWidth, innerHeight);

  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  Object.assign(controls, { minPolarAngle:.15, maxPolarAngle:1.25, minAzimuthAngle:-1.1, maxAzimuthAngle:1.1, minDistance:5, maxDistance:200 });

  const scene = new THREE.Scene();
  const root = new THREE.Group(); scene.add(root);

  /* ───────────── Экраны ───────────── */
  const SCREEN_CACHE = new Map(), scrolling = [];
  function screenTex(kind, color) {
    const key = kind + color;
    if (SCREEN_CACHE.has(key)) return SCREEN_CACHE.get(key);
    const ink = 'rgba(255,255,255,.28)';
    const tex = canvasTex(256, 160, (x, w, h) => {
      x.fillStyle = T.screenBg; x.fillRect(0, 0, w, h);
      x.fillStyle = color; x.fillRect(0, 0, w, 10);
      const R = () => Math.random();
      if (kind === 'code') {
        for (let y = 18; y < h * 2; y += 9) { x.fillStyle = R() < .35 ? color : ink; rr(x, 10 + Math.floor(R() * 4) * 12, y, 30 + R() * 140, 4, 2); }
      } else if (kind === 'chat') {
        for (let y = 18; y < h * 2; y += 22) { const me = R() < .5; x.fillStyle = me ? color : ink; rr(x, me ? w - 130 : 12, y, 90 + R() * 28, 14, 7); }
      } else if (kind === 'chart' || kind === 'ads') {
        for (let i = 0; i < 10; i++) { const bh = 20 + R() * 90; x.fillStyle = i % 3 ? ink : color; rr(x, 14 + i * 23, h - 14 - bh, 15, bh, 3); }
        x.strokeStyle = color; x.lineWidth = 3; x.beginPath();
        for (let i = 0; i <= 10; i++) x.lineTo(14 + i * 23, 120 - i * 7 - R() * 18);
        x.stroke();
        if (kind === 'ads') { x.fillStyle = color; x.font = `800 22px ${FONT}`; x.fillText('ROMI 312%', 14, 40); }
      } else if (kind === 'slides') {
        x.fillStyle = ink; rr(x, 14, 20, 228, 128, 8);
        x.fillStyle = color; rr(x, 30, 40, 110, 14, 4); rr(x, 150, 40, 76, 92, 8);
        x.fillStyle = 'rgba(255,255,255,.5)'; rr(x, 30, 64, 100, 6, 3); rr(x, 30, 76, 80, 6, 3);
      } else if (kind === 'media') {
        for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? color : ink; rr(x, 14 + (i % 3) * 78, 20 + Math.floor(i / 3) * 66, 70, 58, 6); }
      } else if (kind === 'flow') {
        const P = [[40, 50], [128, 40], [210, 60], [70, 120], [170, 118]];
        x.strokeStyle = ink; x.lineWidth = 3;
        [[0,1],[1,2],[0,3],[3,4],[1,4],[2,4]].forEach(([a, b]) => { x.beginPath(); x.moveTo(...P[a]); x.lineTo(...P[b]); x.stroke(); });
        P.forEach((p, i) => { x.fillStyle = i % 2 ? ink : color; x.beginPath(); x.arc(p[0], p[1], 14, 0, 7); x.fill(); });
      } else if (kind === 'calendar') {
        for (let i = 0; i < 28; i++) { x.fillStyle = R() < .3 ? color : ink; rr(x, 14 + (i % 7) * 33, 22 + Math.floor(i / 7) * 33, 28, 28, 4); }
      } else if (kind === 'timeline') {
        x.fillStyle = ink; rr(x, 50, 18, 156, 70, 6);
        for (let t = 0; t < 4; t++) for (let c = 0; c < 4; c++) { x.fillStyle = (t + c) % 3 ? ink : color; rr(x, 10 + c * 62 + R() * 8, 96 + t * 15, 40 + R() * 16, 11, 3); }
        x.fillStyle = '#fff'; x.fillRect(120, 92, 2, 64);
      } else if (kind === 'video') {
        x.fillStyle = ink; rr(x, 40, 18, 176, 130, 10);
        x.fillStyle = color; x.beginPath(); x.arc(128, 70, 26, 0, 7); x.fill(); rr(x, 84, 100, 88, 48, 24);
      } else {
        x.fillStyle = color; rr(x, 20, 22, 120, 10, 3);
        for (let y = 44; y < h - 10; y += 11) { x.fillStyle = ink; rr(x, 20, y, 120 + R() * 100, 5, 2); }
      }
    });
    if (kind === 'code' || kind === 'chat') { tex.wrapT = THREE.RepeatWrapping; tex.repeat.y = .5; scrolling.push(tex); }
    SCREEN_CACHE.set(key, tex);
    return tex;
  }
  const textTex = (text, color, font, w = 1024, h = 160) => canvasTex(w, h, x => {
    x.font = font; x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2);
  });

  /* ───────────── Небо и город ───────────── */
  scene.background = canvasTex(4, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.FogExp2(T.fog[0], T.fog[1]);
  {
    const winTex = canvasTex(128, 256, (x, w, h) => {
      x.fillStyle = T.bld; x.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 12) for (let i = 4; i < w; i += 10) {
        const lit = Math.random() < .42;
        x.fillStyle = lit ? pick(T.win) : 'rgba(255,255,255,.04)';
        x.globalAlpha = lit ? rand(.55, 1) : 1;
        x.fillRect(i, y, 6, 7);
      }
      x.globalAlpha = 1;
    });
    for (let i = 0; i < 46; i++) {
      const w = rand(5, 11), d = rand(5, 9), h = rand(14, 48);
      const t = winTex.clone(); t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 8, h / 16); t.offset.set(Math.random(), Math.random());
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ map:t, color:'#d8d8d8', fog:true }));
      m.position.set(rand(-95, 95), h / 2 - 6, -30 - (i % 3) * 16 - rand(0, 10));
      scene.add(m);
    }
  }

  /* ───────────── Здание ───────────── */
  const W = 44, D = 28;
  box(root, W + 2, .6, D + 2, M(T.base, { rough:.9 }), 0, -.3, 0, { round:false });
  box(root, W, .02, D, M(T.floor, { rough:.85 }), 0, .01, 0, { round:false, shadow:false });
  {
    const em = M(T.edge, { basic:true, glow:1.6, toneMapped:false });
    box(root, W + 2, .06, .06, em, 0, .02, D / 2 + 1, { round:false, shadow:false });
    box(root, .06, .06, D + 2, em, -W / 2 - 1, .02, 0, { round:false, shadow:false });
    box(root, .06, .06, D + 2, em, W / 2 + 1, .02, 0, { round:false, shadow:false });
    const outer = M(T.outer, { rough:.85 });
    box(root, W, 3.4, .3, outer, 0, 1.7, -D / 2 - .15, { round:false });
    box(root, .3, 3.4, D, outer, -W / 2 - .15, 1.7, 0, { round:false });
    box(root, .3, 3.4, D, outer, W / 2 + .15, 1.7, 0, { round:false });
    const sm = M(T.strip, { basic:true, glow:1.8, toneMapped:false });
    for (let z = -11; z <= 11; z += 4.4) {
      box(root, .06, 2.4, .14, sm, -W / 2 + .02, 1.6, z, { shadow:false });
      box(root, .06, 2.4, .14, sm, W / 2 - .02, 1.6, z, { shadow:false });
    }
    // вывески на задней стене
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.56), new THREE.MeshBasicMaterial({
      map:textTex(o.brand || 'AICEX', T.sign, `800 120px ${FONT}`), transparent:true, toneMapped:false }));
    s1.material.color.setScalar(1.6); s1.position.set(15, 2.75, -D / 2 + .02); root.add(s1);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(10, .6), new THREE.MeshBasicMaterial({
      map:textTex('CREATE · AUTOMATE · SCALE', T.sign, `700 64px ${FONT}`, 1024, 64), transparent:true, toneMapped:false }));
    s2.material.color.setScalar(1.4); s2.position.set(-16.5, 2.85, -D / 2 + .02); root.add(s2);
    // живая изгородь спереди
    const hedge = M(T.leaf, { rough:.95 });
    box(root, W - 1, .45, .7, M(T.base, { rough:.9 }), 0, .22, D / 2 + .35, { round:false });
    const sph = new THREE.SphereGeometry(.42, 12, 10);
    for (let x = -W / 2 + 1; x <= W / 2 - 1; x += .78) {
      if (Math.abs(x) < 1.8) continue; // вход
      const m = new THREE.Mesh(sph, hedge); m.position.set(x, .62 + rand(0, .12), D / 2 + .35); m.scale.setScalar(rand(.85, 1.1));
      m.castShadow = true; root.add(m);
    }
  }

  function doorPoint(room, [side, c]) {
    const [x0, z0, x1, z1] = room.r;
    if (side === 's') return { inP:[c, z1 - .9], out:[c, z1 + 1] };
    if (side === 'n') return { inP:[c, z0 + .9], out:[c, z0 - 1] };
    if (side === 'w') return { inP:[x0 + .9, c], out:[x0 - 1, c] };
    return { inP:[x1 - .9, c], out:[x1 + 1, c] };
  }

  // стеклянные стены с тёплой кромкой и полы комнат
  {
    const segs = new Map();
    for (const room of ROOMS) {
      if (room.open) continue;
      const [x0, z0, x1, z1] = room.r;
      const edges = { n:[[x0, z0], [x1, z0]], s:[[x0, z1], [x1, z1]], w:[[x0, z0], [x0, z1]], e:[[x1, z0], [x1, z1]] };
      for (const [side, [a, b]] of Object.entries(edges)) {
        if ((side === 'n' && z0 === -14) || (side === 'w' && x0 === -22) || (side === 'e' && x1 === 22)) continue;
        const key = [a, b].flat().join();
        const gaps = room.doors.filter(d => d[0] === side).map(d => d[1]);
        const prev = segs.get(key);
        segs.set(key, { a, b, gaps:[...(prev?.gaps || []), ...gaps], low:side === 's' && z1 === 14 });
      }
    }
    const glass = M(T.glass[0], { opacity:T.glass[1], rough:.08, metal:.1 });
    const frame = M(T.frame, { rough:.4, metal:.1 });
    const trim = M(T.trim[0], { basic:true, glow:T.trim[1], toneMapped:false });
    for (const { a, b, gaps, low } of segs.values()) {
      const horiz = a[1] === b[1];
      const from = horiz ? a[0] : a[1], to = horiz ? b[0] : b[1];
      const cuts = [[from, from]];
      gaps.sort((p, q) => p - q).forEach(g => cuts.push([g - .85, g + .85]));
      cuts.push([to, to]);
      const H = low ? 1 : 2.3;
      for (let i = 0; i < cuts.length - 1; i++) {
        const s = cuts[i][1], e = cuts[i + 1][0], L = e - s;
        if (L <= .05) continue;
        const mid = (s + e) / 2;
        const pos = horiz ? [mid, a[1]] : [a[0], mid];
        const dims = (h, t) => horiz ? [L, h, t] : [t, h, L];
        const g = box(root, ...dims(H, .05), glass, pos[0], H / 2, pos[1], { round:false, shadow:false });
        g.renderOrder = 2;
        box(root, ...dims(.07, .09), frame, pos[0], H, pos[1], { round:false, shadow:false });
        box(root, ...dims(.06, .1), trim, pos[0], .04, pos[1], { round:false, shadow:false });
        for (let p = s; p <= e + .01; p += Math.max(L / Math.ceil(L / 2.6), .1)) {
          const pp = horiz ? [p, a[1]] : [a[0], p];
          box(root, .07, H, .07, frame, pp[0], H / 2, pp[1], { round:false, shadow:false });
        }
      }
    }
    for (const room of ROOMS) {
      const [x0, z0, x1, z1] = room.r;
      const f = box(root, x1 - x0 - .1, .02, z1 - z0 - .1, M(room.open ? T.hubFloor : T.roomFloor, { rough:.8 }),
        (x0 + x1) / 2, .025, (z0 + z1) / 2, { round:false, shadow:false });
      f.castShadow = false;
    }
  }

  /* ───────────── Мебель ───────────── */
  const SEATS = {};  // id → { x, z, face, room } — место за столом
  const SPOTS = { rest:[], kitchen:[], meet:[], shelf:[], queue:[] };
  function plant(x, z, s = 1) {
    cyl(root, .26 * s, .2 * s, .5 * s, M(T.pot, { rough:.6 }), x, .25 * s, z, 14);
    const leaf = M(T.leaf, { rough:.95 });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.3 * s, 0), leaf);
      m.position.set(x + rand(-.15, .15) * s, (.7 + i * .2) * s, z + rand(-.15, .15) * s);
      m.rotation.set(rand(0, 3), rand(0, 3), 0); m.castShadow = true; root.add(m);
    }
  }
  function chair(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const c = M(T.chair, { rough:.6 });
    box(g, .5, .08, .5, c, 0, .45, 0);
    box(g, .5, .5, .07, c, 0, .75, .24);
    cyl(g, .03, .03, .4, M('#444', { metal:.6, rough:.4 }), 0, .22, 0, 8);
    root.add(g);
  }
  function monitor(x, z, kind, color, w = .62) {
    const back = M('#121214', { rough:.4 });
    box(root, .06, .2, .06, back, x, .86, z - .02);
    box(root, w, .38, .035, back, x, 1.12, z - .03, { r:.02 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - .05, .33), new THREE.MeshBasicMaterial({ map:screenTex(kind, color), toneMapped:false }));
    scr.material.color.setScalar(1.05);
    scr.position.set(x, 1.12, z - .01);
    root.add(scr);
  }
  function deskAt(id, room, screen, color, x, z, big = false) {
    const top = M(T.desk, { rough:.55 });
    const w = big ? 2.1 : 1.4;
    box(root, w, .06, .72, top, x, .74, z);
    box(root, .05, .72, .62, top, x - w / 2 + .06, .37, z);
    box(root, .05, .72, .62, top, x + w / 2 - .06, .37, z);
    if (big) { monitor(x - .42, z - .12, screen, color); monitor(x + .42, z - .12, 'doc', color); }
    else monitor(x, z - .12, screen, color);
    box(root, .38, .02, .13, M('#2a2a2e'), x, .78, z + .12, { shadow:false });
    chair(x, z + .78);
    SEATS[id] = { x, z:z + .72, face:Math.PI, room, sit:true, big };
  }
  function wallScreen(x, y, z, w, h, kind, color, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    box(g, w + .1, h + .1, .06, M('#111'), 0, 0, 0, { r:.02 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map:screenTex(kind, color), toneMapped:false }));
    s.position.z = .035; g.add(s);
    root.add(g);
  }
  function sofa(x, z, ry, w = 2.2) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const m = M(T.sofa, { rough:.95 });
    box(g, w, .4, .9, m, 0, .25, 0, { r:.12 });
    box(g, w, .5, .22, m, 0, .6, -.36, { r:.1 });
    box(g, .2, .35, .9, m, -w / 2 + .1, .5, 0, { r:.08 });
    box(g, .2, .35, .9, m, w / 2 - .1, .5, 0, { r:.08 });
    root.add(g);
  }
  function lampPoint(x, z, y = 3) {
    const l = new THREE.PointLight(T.lamp[0], T.lamp[1], 15, 1.6);
    l.position.set(x, y, z); root.add(l);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), M(T.lamp[0], { basic:true, glow:2, toneMapped:false }));
    b.position.set(x, y - .3, z); root.add(b);
  }

  // кто где сидит: комнаты по отделам, лишние — в операционный зал
  const people = [...o.agents.values()];
  const roomOf = a => {
    const r = ROOM_OF[a.id] || (a.kind === 'head' ? DEPT_ROOM[a.dept?.id] : null) || DEPT_ROOM[a.dept?.id] || 'hub';
    return RM[r] ? r : 'hub';
  };
  {
    let overflow = 0;
    const toHub = a => {
      const [x, z] = OVERFLOW[overflow % OVERFLOW.length];
      const ring = Math.floor(overflow++ / OVERFLOW.length);  // если и зал заполнен — следующий ряд чуть в стороне
      deskAt(a.id, 'hub', a.data.screen || 'doc', a.color, x + ring * .5, z + ring * 1.6);
    };
    for (const room of ROOMS) {
      const list = people.filter(a => a.kind !== 'orch' && roomOf(a) === room.id);
      const heads = room.head ? list.filter(a => a.kind === 'head') : [];
      if (heads[0]) deskAt(heads[0].id, room.id, heads[0].data.screen || 'chart', heads[0].color, room.head[0], room.head[1], true);
      const rest = list.filter(a => a !== heads[0]);
      const S = room.desks;
      if (!S) { rest.forEach(toHub); continue; }
      const cap = S.cols * S.rows, here = rest.slice(0, cap);
      const rows = Math.ceil(here.length / S.cols);
      here.forEach((a, i) => {
        const r = Math.floor(i / S.cols), inRow = Math.min(S.cols, here.length - r * S.cols), c = i % S.cols;
        const span = (S.x1 - S.x0) * (inRow - 1) / Math.max(1, S.cols - 1);
        const x = inRow === 1 ? (S.x0 + S.x1) / 2 : (S.x0 + S.x1) / 2 - span / 2 + span * c / (inRow - 1);
        const z = rows === 1 ? S.zA : S.zA + (S.zB - S.zA) * r / (rows - 1);
        deskAt(a.id, room.id, a.data.screen || 'doc', a.color, x, z);
      });
      rest.slice(cap).forEach(toHub);
    }
  }

  // Кабинет основателя: ваш стол
  deskAt('you', 'ceo', 'chart', T.accent, OWNER_DESK[0], OWNER_DESK[1], true);
  for (const [dx, dz] of [[1.4, 1.5], [-1.4, 1.5], [2.5, 1.1], [-2.5, 1.1], [0, 2.3]])
    SPOTS.queue.push({ x:OWNER_DESK[0] + dx, z:OWNER_DESK[1] + dz, room:'ceo', look:SEATS.you });
  wallScreen(-15, 1.9, -13.78, 3, 1.3, 'chart', '#f5c26b');
  sofa(-12.6, -12.9, 0, 1.8);
  plant(-21.3, -8.3); plant(-11.7, -8.3, .9);
  lampPoint(-16.5, -10.8);

  // Лаунж
  sofa(-8.2, -12.6, 0); sofa(-3.6, -12.6, 0);
  sofa(-9.9, -10.3, Math.PI / 2, 1.8);
  {
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), M(T.rug, { rough:1, opacity:.35 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-6, .04, -10.6); root.add(rug);
    cyl(root, .7, .7, .3, M(T.desk, { rough:.5 }), -6, .2, -10.6, 28);
    for (const [x, z] of [[-4.2, -9.4], [-7.6, -9.2]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.45, 16, 12), M(T.sofa, { rough:1 }));
      b.scale.y = .6; b.position.set(x, .28, z); b.castShadow = true; root.add(b);
    }
  }
  plant(-1.8, -13.2, 1.2); plant(-10.3, -13.2);
  SPOTS.rest.push({ x:-8.2, z:-12, room:'lounge', face:0, sit:true }, { x:-3.6, z:-12, room:'lounge', face:0, sit:true },
                  { x:-9.4, z:-10.3, room:'lounge', face:Math.PI / 2, sit:true }, { x:-4.2, z:-8.8, room:'lounge', face:Math.PI }, { x:-7.6, z:-8.6, room:'lounge', face:Math.PI },
                  { x:-8.9, z:-12, room:'lounge', face:0, sit:true }, { x:-2.9, z:-12, room:'lounge', face:0, sit:true });
  lampPoint(-6, -10.6);

  // Кухня
  {
    const counter = M(T.desk, { rough:.4 });
    box(root, 7.6, .95, .7, counter, 3.5, .48, -13.4);
    box(root, 7.6, .9, .4, counter, 3.5, 2.1, -13.6);
    box(root, 7.4, .04, .05, M(T.trim[0], { basic:true, glow:1.6, toneMapped:false }), 3.5, 1.62, -13.45, { shadow:false });
    box(root, .5, .45, .4, M('#1a1a1a', { rough:.3, metal:.6 }), 1.4, 1.18, -13.4);
    box(root, 3.4, .95, 1.1, counter, 3.5, .48, -10.6);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) cyl(root, .2, .16, .7, M(T.chair), 2.3 + i * 1.2, .35, -10.6 + s * .9, 14);
  }
  plant(7.3, -8.3);
  SPOTS.kitchen.push({ x:2.3, z:-9.6, room:'kitchen', face:Math.PI }, { x:4.7, z:-9.6, room:'kitchen', face:Math.PI },
                     { x:3.5, z:-11.6, room:'kitchen', face:0 }, { x:1.4, z:-12.7, room:'kitchen', face:Math.PI },
                     { x:3.5, z:-9.6, room:'kitchen', face:Math.PI }, { x:5.6, z:-12.7, room:'kitchen', face:Math.PI });
  lampPoint(3.5, -10.6);

  // Переговорная
  box(root, 7.4, .08, 1.7, M(T.desk, { rough:.4 }), 15, .76, -11);
  box(root, 6.6, .7, .2, M(T.desk), 15, .38, -11);
  wallScreen(15, 1.9, -13.78, 3.6, 1.6, 'chart', '#5ad1ff');
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const x = 12.2 + i * 1.4, z = -11 + s * 1.25;
    chair(x, z, s < 0 ? Math.PI : 0);
    SPOTS.meet.push({ x, z:z + s * .05, room:'meet', face:s < 0 ? 0 : Math.PI, sit:true });
  }
  plant(21.2, -8.3); plant(8.8, -13.2);
  lampPoint(15, -11);

  // Маркетинг
  wallScreen(-21.75, 1.5, -2, 2.2, 1.1, 'calendar', '#ff8fb1', Math.PI / 2);
  plant(-12.7, 3.3); plant(-21.3, 3.3, .9);
  lampPoint(-17, -1);

  // Аналитика
  wallScreen(-19.5, 1.4, 6.4, 2.4, 1.2, 'chart', '#5ad1ff');
  wallScreen(-16.3, 1.4, 6.4, 2.4, 1.2, 'chart', '#c38bff');
  plant(-21.3, 13.2); plant(-12.8, 13.2);
  box(root, 2.4, .45, .9, M(T.sofa, { rough:.95 }), -17, .25, 12.6, { r:.12 });
  lampPoint(-17, 9.5);

  // Операционный зал: стол оркестратора, доска рабочего стола, архив готовых работ
  {
    const rd = new THREE.Mesh(new THREE.TorusGeometry(1.25, .32, 10, 40, Math.PI * 1.3), M(T.desk, { rough:.5 }));
    rd.rotation.x = Math.PI / 2; rd.rotation.z = Math.PI * .85; rd.position.set(-.6, .62, -1.2); rd.castShadow = true; root.add(rd);
    monitor(-.6, -2, 'flow', '#ffffff', .7);
    chair(-.6, -1.1);
    SEATS.orchestrator = { x:-.6, z:-1.15, face:Math.PI, room:'hub', sit:true };
    const pr = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.75, 64), M(T.rug, { basic:true, glow:1.4, toneMapped:false, opacity:.8, side:THREE.DoubleSide }));
    pr.rotation.x = -Math.PI / 2; pr.position.set(-.6, .045, -1.2); root.add(pr);
  }
  const boardG = new THREE.Group(); boardG.position.set(2.4, 0, -4.7); root.add(boardG);
  box(boardG, 7.2, 3.3, .12, M('#0d0d10', { rough:.4 }), 0, 1.95, 0, { r:.05 });
  box(boardG, .12, .35, .12, M('#333'), -2.8, .17, 0); box(boardG, .12, .35, .12, M('#333'), 2.8, .17, 0);
  const boardTex = canvasTex(1024, 460, () => {});
  {
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.1), new THREE.MeshBasicMaterial({ map:boardTex, toneMapped:false }));
    bs.position.set(0, 1.95, .07); boardG.add(bs);
  }
  // архив: стеллаж с папками готовых работ — сюда ходят «за материалами»
  {
    const sh = M(T.desk, { rough:.6 }), glow = M(T.strip, { basic:true, glow:1.4, toneMapped:false });
    box(root, 2.8, 2, .45, M(T.frame, { rough:.6 }), -4.6, 1, -5.05);
    for (let k = 0; k < 4; k++) {
      box(root, 2.7, .04, .42, sh, -4.6, .3 + k * .48, -4.98, { shadow:false });
      box(root, 2.6, .02, .02, glow, -4.6, .33 + k * .48, -4.78, { shadow:false });
      for (let i = 0; i < 14; i++) box(root, .1, .3, .3, M(pick(['#ffb45c', '#c9b9a6', '#7a5234', '#5ad1ff', '#ff8fb1']), { rough:.7 }), -5.8 + i * .18, .48 + k * .48, -5, { shadow:false, round:false });
    }
    for (const x of [-5.5, -4.6, -3.7]) SPOTS.shelf.push({ x, z:-4.2, room:'hub', face:Math.PI });
  }
  for (const x of [-7, 6.4]) {
    cyl(root, 1.3, 1.4, .5, M(T.desk, { rough:.7 }), x, .25, 1.6, 28);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(.4, .55), 0), M(T.leaf, { rough:.95 }));
      m.position.set(x + Math.cos(i) * .7, .8 + rand(0, .3), 1.6 + Math.sin(i) * .7); m.castShadow = true; root.add(m);
    }
    const t = new THREE.Mesh(new THREE.TorusGeometry(1.42, .03, 6, 48), M(T.trim[0], { basic:true, glow:1.6, toneMapped:false }));
    t.rotation.x = Math.PI / 2; t.position.set(x, .06, 1.6); root.add(t);
  }
  plant(-9.4, -5); plant(9.4, -5); plant(-9.4, 3.4); plant(9.4, 3.4);
  lampPoint(0, -1);

  // Продажи
  wallScreen(21.75, 1.5, -2, 2.2, 1.1, 'chat', '#7ad37a', -Math.PI / 2);
  plant(12.7, 3.3); plant(21.3, 3.3, .9);
  lampPoint(17, -1);

  // Технический отдел: серверные стойки
  const leds = [];
  {
    const rack = M('#111216', { rough:.4, metal:.4 });
    for (let i = 0; i < 4; i++) {
      const z = 7 + i * 1.6;
      box(root, .8, 2.1, 1.2, rack, 21.1, 1.05, z);
      for (let k = 0; k < 6; k++) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(.02, .05, .4), M(pick(['#3ddc97', '#4da3ff', '#ffb45c']), { basic:true, glow:2, toneMapped:false }));
        led.position.set(20.69, .4 + k * .3, z); root.add(led); leds.push(led);
      }
    }
  }
  plant(12.8, 13.2); plant(18.2, 13.2);
  lampPoint(16.5, 9.5);

  // Контент-студия: съёмочная площадка
  box(root, .12, 2.6, 3.4, M('#e8e8e8', { rough:.9 }), -1.1, 1.3, 10.8);
  for (const z of [9, 12.6]) {
    cyl(root, .03, .03, 1.8, M('#222'), -3.4, .9, z, 6);
    const sb = box(root, .7, .6, .3, M('#ffffff', { basic:true, glow:1.5, toneMapped:false }), -3.4, 1.95, z, { shadow:false });
    sb.rotation.y = -Math.PI / 4 * (z < 10 ? 1 : -1);
  }
  cyl(root, .03, .03, 1.2, M('#222'), -4.4, .6, 10.8, 6);
  box(root, .45, .3, .3, M('#151515', { rough:.3 }), -4.4, 1.35, 10.8);
  lampPoint(-5.5, 9.5);

  // Реклама Meta
  wallScreen(3.4, 1.45, 6.4, 3, 1.35, 'ads', '#ff7a59');
  wallScreen(7.2, 1.45, 6.4, 2.6, 1.35, 'chart', '#ff9a6b');
  plant(1.3, 13.2); plant(9.3, 13.2);
  lampPoint(5, 10);

  /* ───────────── Свет ───────────── */
  scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
  const sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
  sun.position.set(-18, 40, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(o.mobile ? 1024 : 2048, o.mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left:-30, right:30, top:24, bottom:-24, near:5, far:110 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
  scene.add(sun);

  /* ───────────── Навигация по коридорам ───────────── */
  const GRAPH = (() => {
    const nodes = [], key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2), idx = new Map();
    const add = p => { const k = key(p); if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push({ p, e:[] }); } return idx.get(k); };
    CORRIDORS.forEach(([a, b]) => { add(a); add(b); });
    ROOMS.forEach(r => r.doors.forEach(d => add(doorPoint(r, d).out)));
    for (const [a, b] of CORRIDORS) {
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      const on = nodes.map((n, i) => {
        const t = ((n.p[0] - a[0]) * dx + (n.p[1] - a[1]) * dz) / L2;
        const px = a[0] + t * dx, pz = a[1] + t * dz;
        return (t >= -1e-6 && t <= 1 + 1e-6 && Math.hypot(px - n.p[0], pz - n.p[1]) < .01) ? [t, i] : null;
      }).filter(Boolean).sort((p, q) => p[0] - q[0]);
      for (let i = 0; i < on.length - 1; i++) {
        const A = on[i][1], B = on[i + 1][1];
        const w = Math.hypot(nodes[A].p[0] - nodes[B].p[0], nodes[A].p[1] - nodes[B].p[1]);
        nodes[A].e.push([B, w]); nodes[B].e.push([A, w]);
      }
    }
    const shortest = (from, to) => {
      const s = idx.get(key(from)), t = idx.get(key(to));
      const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = new Set();
      dist[s] = 0;
      while (done.size < nodes.length) {
        let u = -1;
        for (let i = 0; i < nodes.length; i++) if (!done.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || dist[u] === Infinity) break;
        done.add(u);
        if (u === t) break;
        for (const [v, w] of nodes[u].e) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
      }
      const path = [];
      for (let u = t; u >= 0; u = prev[u]) path.unshift(nodes[u].p);
      return { len:dist[t], path };
    };
    return { shortest };
  })();
  function route(from, fromRoom, to, toRoom) {
    if (fromRoom === toRoom) return [[to.x, to.z]];
    let best = null;
    for (const da of RM[fromRoom].doors.map(d => doorPoint(RM[fromRoom], d)))
      for (const db of RM[toRoom].doors.map(d => doorPoint(RM[toRoom], d))) {
        const g = GRAPH.shortest(da.out, db.out);
        const len = Math.hypot(from.x - da.inP[0], from.z - da.inP[1]) + g.len + Math.hypot(to.x - db.inP[0], to.z - db.inP[1]);
        if (!best || len < best.len) best = { len, pts:[da.inP, ...g.path, db.inP, [to.x, to.z]] };
      }
    return best.pts;
  }

  /* ───────────── Люди ─────────────
     Фигуры из концепта: у агентов — светящийся визор цвета зоны, у руководителей — волосы. */
  const byId = new Map();
  const pickables = [];
  class Person {
    constructor(src, def) {
      this.src = src; this.def = def; this.id = def.id;
      this.seat = SEATS[def.id] || SEATS.orchestrator;
      this.room = this.seat.room; this.walking = false; this.path = [];
      this.key = 'home'; this.want = 'home'; this.dwell = 0; this.claim = null; this.t = Math.random() * 10;
      this.build();
      this.place(this.seat.x, this.seat.z, this.seat.face, true);
    }
    build() {
      const d = this.def;
      const g = this.g = new THREE.Group();
      const shirt = M(d.color, { rough:.7 });
      const pants = M(d.suit || '#24262e', { rough:.8 });
      const skin = M(d.skin || pick(['#f0c7a8', '#e3b497', '#c98f6d', '#f5d3bc']), { rough:.7 });
      const legGeo = rbox(.17, .66, .2, .06);
      this.legs = [-.11, .11].map(x => {
        const p = new THREE.Group(); p.position.set(x, .7, 0);
        const m = new THREE.Mesh(legGeo, pants); m.position.y = -.33; m.castShadow = true; p.add(m); g.add(p); return p;
      });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .42, 4, 12), shirt);
      body.position.y = 1.08; body.castShadow = true; g.add(body);
      const armGeo = rbox(.1, .5, .12, .05);
      this.arms = [-.33, .33].map(x => {
        const p = new THREE.Group(); p.position.set(x, 1.32, 0);
        const m = new THREE.Mesh(armGeo, shirt); m.position.y = -.24; m.castShadow = true; p.add(m); g.add(p); return p;
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 18, 14), skin);
      head.position.y = 1.6; head.castShadow = true; g.add(head);
      if (d.human) {
        const hm = M(d.hair || '#2b1d14', { rough:.9 });
        const hair = new THREE.Mesh(new THREE.SphereGeometry(.215, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), hm);
        hair.position.y = 1.62; hair.rotation.x = -.25; g.add(hair);
        if (d.long) box(g, .4, .45, .12, hm, 0, 1.45, -.14, { r:.05 });
      } else {
        const v = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, .05), M(d.color, { basic:true, glow:1.6, toneMapped:false }));
        v.position.set(0, 1.63, .18); g.add(v);
      }
      this.dot = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), new THREE.MeshBasicMaterial({ color:'#3ddc97', toneMapped:false }));
      this.dot.position.y = 2.02; g.add(this.dot);
      this.item = box(g, .3, .22, .22, M(d.color, { basic:true, glow:1.5, toneMapped:false }), 0, 1, .38, { shadow:false });
      this.item.visible = false;
      this.ring = new THREE.Mesh(new THREE.RingGeometry(.45, .58, 32), new THREE.MeshBasicMaterial({ color:T.accent, transparent:true, opacity:.9, toneMapped:false, side:THREE.DoubleSide }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = .05; this.ring.visible = false; g.add(this.ring);
      const proxy = new THREE.Mesh(new THREE.CapsuleGeometry(.45, 1.2, 4, 8), new THREE.MeshBasicMaterial({ visible:false }));
      proxy.position.y = 1; proxy.userData.pick = this.id; g.add(proxy); pickables.push(proxy);
      // подпись: копия подписи основного офиса (имя и статус), клик — как там
      const el = this.labelEl = document.createElement('div');
      el.addEventListener('click', e => { e.stopPropagation(); o.onPick(this.id); });
      this.label = new CSS2DObject(el); this.label.position.y = 2.35; g.add(this.label);
      root.add(g);
    }
    get x() { return this.g.position.x; }
    get z() { return this.g.position.z; }
    place(x, z, face, sit) { this.g.position.set(x, 0, z); this.g.rotation.y = face; this.sitting = !!sit; }
    faceTo(x, z) { this.g.rotation.y = Math.atan2(x - this.x, z - this.z); }
    bubble(text, s = 3.2) {
      if (!text) return;
      const el = document.createElement('div'); el.className = 'nbub'; el.textContent = text.length > 70 ? text.slice(0, 69) + '…' : text;
      const ob = new CSS2DObject(el); ob.position.y = 2.75; this.g.add(ob);
      setTimeout(() => { this.g.remove(ob); el.remove(); }, s * 1000);
    }
    walkTo(spot, done) {
      this.path = route({ x:this.x, z:this.z }, this.room, spot, spot.room).map(p => new THREE.Vector2(p[0], p[1]));
      this.walking = true; this.sitting = false;
      this.onArrive = () => { this.room = spot.room; this.walking = false; this.sitting = !!spot.sit; if (spot.face != null) this.g.rotation.y = spot.face; done?.(); };
    }
    // куда идёт двойник в основной симуляции
    dest() {
      const a = this.src; if (!a) return 'home';
      const A = a.act;
      if (A?.type === 'walk') {
        if (A.target === 'you') return 'you';
        if (A.target?.id) return 'to:' + A.target.id;
        if (Math.hypot(A.x - a.home.x, A.z - a.home.z) < .3) return 'home';
        if (a.status === 'meeting') return 'meet';
        if (a.status === 'research') return 'shelf';
        if (a.status === 'rounds' && a.lastVisit) return 'to:' + a.lastVisit.id;
        if (a.status === 'break') return 'rest';
        if (a.kind === 'head') return 'kitchen';
        return 'home';
      }
      return a.atHome() ? 'home' : null;
    }
    release() { if (this.claim) { this.claim.by = null; this.claim = null; } }
    claimFrom(list) {
      const free = list.filter(s => !s.by);
      const s = free.length ? pick(free) : pick(list);
      s.by = this; this.claim = s; return s;
    }
    go(key) {
      this.key = key; this.release();
      const a = this.src;
      if (key === 'home') return this.walkTo(this.seat);
      if (key === 'you') {
        const s = this.claimFrom(SPOTS.queue);
        return this.walkTo(s, () => { this.faceTo(s.look.x, s.look.z - .7); this.arrived(); });
      }
      if (key.startsWith('to:')) {
        const b = byId.get(key.slice(3)); if (!b) return this.walkTo(this.seat);
        const s = b.seat, sp = s.big ? { x:s.x + 1.5, z:s.z - .2, room:s.room } : { x:s.x + .85, z:s.z - .15, room:s.room };
        return this.walkTo(sp, () => { this.faceTo(b.x, b.z); this.arrived(b); });
      }
      const list = key === 'meet' ? SPOTS.meet : key === 'shelf' ? SPOTS.shelf : key === 'kitchen' ? SPOTS.kitchen : [...SPOTS.rest, ...SPOTS.kitchen];
      this.walkTo(this.claimFrom(list));
      if (a?.kind === 'orch' && key === 'meet') this.bubble('Планёрка: что выпускаем на этой неделе?', 4);
    }
    // пришёл с материалом: сказать, что принёс, и подождать, пока его увидят
    arrived(b) {
      const c = this.src?.carrying;
      if (c) {
        this.bubble(c.o?.say ? c.o.say[0].toUpperCase() + c.o.say.slice(1) : b ? `«${c.item}»` : `На проверку: «${c.item}»`);
        if (b) b.bubble(`Принял: ${c.item}`, 2.6);
      }
      this.dwell = 2.2;
    }
    update(dt, now) {
      this.t += dt;
      const a = this.src;
      const want = this.dest();
      if (want) this.want = want;
      if (this.walking) {
        const target = this.path[0];
        const p = this.g.position, dx = target.x - p.x, dz = target.y - p.z, d = Math.hypot(dx, dz);
        const step = 2.3 * dt;
        if (d <= step) { p.x = target.x; p.z = target.y; this.path.shift(); if (!this.path.length) { const f = this.onArrive; this.onArrive = null; f && f(); } }
        else {
          p.x += dx / d * step; p.z += dz / d * step;
          let diff = Math.atan2(dx, dz) - this.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          this.g.rotation.y += diff * Math.min(1, dt * 12);
        }
      } else if (this.dwell > 0) this.dwell -= dt;
      else if (this.want !== this.key) this.go(this.want);

      const status = a ? a.sceneStatus() : 'head';
      const carry = this.item.visible = !!a?.carrying;
      const L = this.legs, A = this.arms;
      const cheer = a && now < a.flashUntil && a.flashPose === 'cheer';
      if (this.walking) {
        const s = Math.sin(this.t * 9);
        L[0].rotation.x = s * .6; L[1].rotation.x = -s * .6;
        A[0].rotation.x = carry ? -1.1 : -s * .5; A[1].rotation.x = carry ? -1.1 : s * .5;
        this.g.position.y = Math.abs(Math.cos(this.t * 9)) * .05;
      } else if (this.sitting) {
        this.g.position.y = -.23;
        L[0].rotation.x = L[1].rotation.x = -Math.PI / 2;
        const typing = this.key === 'home' && (status === 'working' || status === 'head' || !a);
        A[0].rotation.x = -1 + (typing ? Math.sin(this.t * 14) * .08 : 0);
        A[1].rotation.x = -1 + (typing ? Math.cos(this.t * 13) * .08 : 0);
        if (status === 'thinking' || status === 'asking') A[1].rotation.x = -2.3;
        if (cheer) A[0].rotation.x = A[1].rotation.x = -2.8 + Math.sin(this.t * 12) * .15;
      } else {
        this.g.position.y = 0;
        L[0].rotation.x = L[1].rotation.x = 0;
        const talk = this.dwell > 0 || status === 'presenting' || status === 'rounds';
        A[0].rotation.x = carry ? -1.1 : cheer ? -2.8 : Math.sin(this.t * (talk ? 5 : 1.5)) * (talk ? .25 : .05);
        A[1].rotation.x = carry ? -1.1 : cheer ? -2.8 : -Math.sin(this.t * (talk ? 4 : 1.5)) * (talk ? .2 : .05);
      }
      this.dot.position.y = 2.02 + Math.sin(this.t * 3) * .03;
      this.dot.material.color.set(o.statusColor(status));
      const sel = o.selected() === this.id;
      this.ring.visible = sel || !!a?.live;
      if (this.ring.visible) {
        this.ring.material.color.set(sel ? '#ffffff' : T.accent);
        this.ring.material.opacity = .55 + Math.sin(this.t * 5) * .35;
      }
    }
  }

  for (const a of people) {
    const human = a.kind === 'head';
    const def = { id:a.id, color:human ? a.color : a.data.color, human, skin:human ? a.data.skin : null, hair:a.data.hair,
      long:a.data.hairStyle === 'long', suit:human ? a.data.suit : null };
    const p = new Person(a, def); byId.set(a.id, p);
  }
  const ownerHead = o.owner || {};
  const owner = new Person(null, { id:'you', color:T.accent, human:true, skin:ownerHead.skin || '#e3b497', hair:ownerHead.hair || '#3b2a1e', suit:ownerHead.suit });
  owner.labelEl.className = 'deskl';

  /* ───────────── Подписи комнат ───────────── */
  const roomLabels = [];
  for (const room of ROOMS) {
    const el = document.createElement('div'); el.className = 'nroom';
    el.innerHTML = `<span class="ic">${svg(room.icon)}</span><span><b>${esc(room.name)}</b><small>${esc(room.sub)}</small></span><span class="n">0</span>`;
    el.addEventListener('click', e => { e.stopPropagation(); flyRoom(room.id); });
    const ob = new CSS2DObject(el);
    const [x0, z0] = room.r;
    ob.position.set(room.id === 'hub' ? -9.4 : x0 + .4, room.open ? .4 : 2.6, room.id === 'hub' ? -3.6 : z0 + .3);
    root.add(ob); roomLabels.push({ room, ob, n:el.querySelector('.n') });
  }

  /* ───────────── Доска рабочего стола ───────────── */
  function drawBoard() {
    const c = boardTex.userData.canvas, x = c.getContext('2d'), w = c.width, h = c.height;
    const B = o.board(), n = B.cols.length, gap = 14, cw = (w - 56 - gap * (n - 1)) / n;
    const fit = (s, max) => { s = String(s); if (x.measureText(s).width <= max) return s; while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
    x.fillStyle = '#0c0d12'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.font = `800 30px ${FONT}`; x.textBaseline = 'top';
    x.fillText(B.title, 28, 22);
    B.cols.forEach(({ name, color, items }, i) => {
      const X = 28 + i * (cw + gap);
      x.fillStyle = color; x.font = `800 20px ${FONT}`; x.fillText(fit(`${name} · ${items.length}`, cw), X, 76);
      items.slice(0, 4).forEach((it, k) => {
        const Y = 110 + k * 84;
        x.fillStyle = '#191b22'; rr(x, X, Y, cw, 74, 10);
        x.fillStyle = color; x.fillRect(X, Y + 10, 4, 54);
        x.fillStyle = '#eaeaea'; x.font = `700 18px ${FONT}`;
        // название — в две строки
        const words = String(it.title).split(' '); let line = '', ln = 0;
        for (const wd of words) {
          if (line && x.measureText(line + wd).width > cw - 30) { if (ln === 0) { x.fillText(line.trim(), X + 16, Y + 8); line = ''; ln = 1; } else { line += wd + ' '; break; } }
          line += wd + ' ';
        }
        x.fillText(fit(line.trim(), cw - 30), X + 16, Y + 8 + ln * 22);
        x.fillStyle = '#8b90a0'; x.font = `600 14px ${FONT}`;
        x.fillText(fit(it.who || '', cw - 30), X + 16, Y + 54);
      });
    });
    boardTex.needsUpdate = true;
  }
  drawBoard();

  /* ───────────── Постобработка ───────────── */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), ...T.bloom));
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth, innerHeight);

  /* ───────────── Камера ───────────── */
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  let fly = null, moved = false;  // moved: камеру уже двигали — ресайз не возвращает обзор
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function flyTo(pos, target, dur = 1.6) {
    moved = true;
    if (o.reduceMotion) { camera.position.copy(pos); controls.target.copy(target); fly = null; return; }
    fly = { p0:camera.position.clone(), t0:controls.target.clone(), p1:pos, t1:target, s:performance.now(), d:dur * 1000 };
  }
  // дальше, когда сбоку открыта панель: здание целиком остаётся в свободной части экрана
  let off = 0;
  const fit = () => (innerWidth < innerHeight ? 1.35 : Math.max(1, .95 / (innerWidth / innerHeight))) * (1 + off);
  const overviewPose = () => { const d = fit(); return { pos:V3(0, 58 * d, 54 * d), target:V3(0, 0, 3) }; };
  function overview() { const v = overviewPose(); flyTo(v.pos, v.target); }
  function plan() { const d = fit(); flyTo(V3(0, 86 * d, 18 * d), V3(0, 0, 1)); }
  function flyRoom(id) {
    if (id === 'all') return overview();
    const r = RM[id]; if (!r) return;
    const [x0, z0, x1, z1] = r.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, s = Math.max(x1 - x0, (z1 - z0) * 1.4) * fit();
    flyTo(V3(cx, s * 1.45, cz + s * 1.35), V3(cx, 0, cz));
  }
  function ownerDesk() { const s = SEATS.you; flyTo(V3(s.x + 1.2, 7.5, s.z + 9), V3(s.x + .6, .8, s.z - .3), 1.8); }
  function focus(id) {
    const p = id === 'you' ? owner : byId.get(id); if (!p) return;
    flyTo(V3(p.x, 8.5, p.z + 11), V3(p.x, 1, p.z), 1.3);
  }
  controls.addEventListener('start', () => { fly = null; moved = true; });
  const resetPose = () => { const v = overviewPose(); camera.position.copy(v.pos); controls.target.copy(v.target); controls.update(); };
  resetPose();

  /* ───────────── Клики ───────────── */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const pickAt = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(pickables, false)[0]?.object.userData.pick || null;
  };
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    o.onPick(pickAt(e));
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') renderer.domElement.style.cursor = pickAt(e) ? 'pointer' : '';
  });

  /* ───────────── Кадр ───────────── */
  let labelsOn = true, labT = 0, boardT = 0;
  const tmp = new THREE.Vector3();
  const all = [...byId.values(), owner];
  function paintLabels() {
    for (const p of all) {
      const src = p.src ? p.src.labelEl : null, el = p.labelEl;
      const cls = src ? src.className : 'deskl', html = src ? src.innerHTML : o.ownerLabel();
      if (el._h !== html || el.className !== cls) { el._h = html; el.innerHTML = html; el.className = cls; }
      if (src) { el.style.setProperty('--c', src.style.getPropertyValue('--c')); el.style.setProperty('--s', src.style.getPropertyValue('--s')); }
    }
    const count = {};
    for (const p of byId.values()) count[p.room] = (count[p.room] || 0) + 1;
    count.ceo = (count.ceo || 0) + 1;
    for (const r of roomLabels) r.n.textContent = count[r.room.id] || 0;
  }
  function frame(dt, now) {
    for (const p of all) p.update(dt, now);
    for (const t of scrolling) t.offset.y = (t.offset.y + dt * .05) % 1;
    if (Math.random() < dt * 8) { const l = pick(leds); l.visible = !l.visible; }
    if ((labT -= dt) <= 0) { labT = .4; paintLabels(); }
    if ((boardT -= dt) <= 0) { boardT = 4; drawBoard(); }
    // камера: перелёт или слежка за агентом
    if (fly) {
      const k = Math.min(1, (performance.now() - fly.s) / fly.d), e = ease(k);
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (k >= 1) fly = null;
    } else {
      const f = byId.get(o.follow());
      if (f) { tmp.set(f.x, 1, f.z).sub(controls.target).multiplyScalar(1 - Math.exp(-4 * dt)); controls.target.add(tmp); camera.position.add(tmp); }
    }
    controls.update();
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -24, 24);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -16, 17);
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.density = T.fog[1] * 79 / dist;
    // подписи агентов: вблизи — все, издалека — только важные
    const sel = o.selected();
    for (const p of all) {
      const s = p.src?.sceneStatus(), d = camera.position.distanceTo(tmp.set(p.x, 1.2, p.z));
      p.label.visible = labelsOn && (d < 30 || sel === p.id || !!p.src?.live || s === 'presenting' || s === 'asking' || s === 'review' || (!p.src && d < 60) || (s === 'carrying' && d < 55));
    }
    for (const r of roomLabels) r.ob.visible = labelsOn;
    composer.render();
    labelRenderer.render(scene, camera);
  }
  function resize(ox = 0, oy = 0) {
    camera.aspect = innerWidth / innerHeight;
    off = ox ? Math.min(.3, ox * 2.4 / innerWidth) : oy ? .12 : 0;
    if (ox || oy) camera.setViewOffset(innerWidth, innerHeight, ox, oy, innerWidth, innerHeight); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    if (!moved) resetPose();
  }
  const roomOfDept = id => ROOMS.find(r => r.dept === id)?.id || 'hub';
  paintLabels();
  return {
    frame, resize, overview, plan, desk:ownerDesk, focus, room:flyRoom, roomOfDept, rooms:ROOMS.length,
    labels(on) { labelsOn = on; },
    stop() { fly = null; },
    __debug:{ scene, camera, controls, byId, owner, SEATS, renderer },
  };
}
