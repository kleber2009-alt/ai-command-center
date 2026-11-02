/* Голограмма двойника в 3D-офисе: проектор на полу, световой конус и голова из тысяч точек
   (та же процедурная голова, что в twin/concepts.html?v=24). Вызывается кнопкой «Голограмма»
   в доке, появляется в центре офиса, поворачивается к камере или к агенту, о котором говорит,
   и тянет к нему световой луч. Работает в обеих сценах — «Галерея» (index.html) и «Ночной Сити»
   (night.js): модуль получает сцену и точку на полу, а обновляется из цикла index.html. */

import * as THREE from 'three';

const CYAN = new THREE.Color('#5ef2ff');
const NI = 96, NJ = 72;                  // точек по кругу × сверху вниз
const HEAD_Y = 2.25, HEAD_S = 0.52;      // высота центра головы и её размер, м

// процедурная голова: th — вокруг (0 — лицом к нам), ph — от макушки вниз
function headPt(th, ph, mouth) {
  const sp = Math.sin(ph); let x = sp * Math.sin(th) * 0.74, y = Math.cos(ph) * 1.02, z = sp * Math.cos(th) * 0.86;
  const front = Math.max(0, Math.cos(th)), jaw = Math.max(0, Math.min(1, (-y - 0.15) / 0.8));
  x *= 1 - jaw * 0.32; z *= 1 - jaw * 0.12;
  const zb = z;
  const e = (a, b, sa, sb) => Math.exp(-(a * a) / sa - (b * b) / sb);
  z += front * 0.2 * Math.exp(-th * th / 0.012) * Math.max(0, Math.min(1, (0.1 - y) / 0.4)) * Math.max(0, Math.min(1, (y + 0.4) / 0.06));
  z -= front * 0.07 * (e(th - 0.36, y - 0.14, 0.014, 0.008) + e(th + 0.36, y - 0.14, 0.014, 0.008));
  z += front * 0.04 * e(th, y - 0.42, 0.25, 0.02) + front * 0.05 * e(th, y + 0.8, 0.05, 0.02);
  z -= front * (0.025 + mouth * 0.09) * e(th, y + 0.52, 0.05, 0.002 + mouth * 0.006);
  return [x, y, z, Math.abs(z - zb)];   // 4-е — насколько точка — черта лица (нос, глазницы, губы)
}

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(235,255,255,1)'); gr.addColorStop(0.25, 'rgba(94,242,255,.8)'); gr.addColorStop(1, 'rgba(94,242,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createHologram({ scene, x = 0, z = 0, scale = 1.35, light = false }) {
  const root = new THREE.Group(); root.position.set(x, 0, z); root.scale.setScalar(scale); root.visible = false;
  root.userData.keep = true; scene.add(root);
  const add = (m, ...p) => { if (p.length) m.position.set(...p); m.userData.keep = true; root.add(m); return m; };
  const additive = o => ({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, ...o });

  // проектор
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.08, 48), new THREE.MeshStandardMaterial({ color:'#0d1a20', metalness:0.6, roughness:0.35 })), 0, 0.04, 0);
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.018, 8, 64), new THREE.MeshBasicMaterial(additive({ color:CYAN }))), 0, 0.085, 0);
  ring.rotation.x = Math.PI / 2;
  const lens = add(new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshBasicMaterial(additive({ color:CYAN, opacity:0.55 }))), 0, 0.087, 0);
  lens.rotation.x = -Math.PI / 2;

  // световой конус: прозрачность тает к верху
  const coneH = HEAD_Y - 0.1;
  const coneMat = new THREE.ShaderMaterial({
    uniforms:{ uA:{ value:0 }, uT:{ value:0 }, uC:{ value:CYAN } }, side:THREE.DoubleSide, ...additive({}),
    vertexShader:'varying float vY; varying vec2 vUv; void main(){ vY = uv.y; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:'uniform float uA; uniform float uT; uniform vec3 uC; varying float vY; varying vec2 vUv; void main(){ float s = 0.75 + 0.25 * sin(vUv.x * 60.0 + uT * 3.0); float a = uA * (1.0 - vY) * (1.0 - vY) * 0.28 * s; gl_FragColor = vec4(uC, a); }',
  });
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.36, coneH, 48, 1, true), coneMat), 0, 0.09 + coneH / 2, 0);

  // голова из точек
  const head = add(new THREE.Group(), 0, HEAD_Y, 0); head.scale.setScalar(HEAD_S);
  const N = NI * NJ, pos = new Float32Array(N * 3), alp = new Float32Array(N), jit = new Float32Array(N * 3);
  for (let k = 0; k < N * 3; k++) jit[k] = Math.random() - 0.5;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1));
  // круглые точки с прозрачностью по глубине: лицо ярче, затылок едва виден; размер — в метрах
  const ptsMat = new THREE.ShaderMaterial({
    uniforms:{ uC:{ value:new THREE.Color(light ? '#0790ad' : '#5ef2ff') }, uSize:{ value:light ? 0.02 : 0.016 }, uH:{ value:800 }, uO:{ value:1 } },
    transparent:true, depthWrite:false, blending:light ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexShader:'attribute float alpha; uniform float uSize; uniform float uH; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * projectionMatrix[1][1] * uH * 0.5 / -mv.z; vA = alpha; }',
    fragmentShader:'uniform vec3 uC; uniform float uO; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uC, vA * uO * smoothstep(0.5, 0.15, d)); }',
  });
  const pts = new THREE.Points(geo, ptsMat); pts.frustumCulled = false; pts.userData.keep = true; head.add(pts);

  // глаза
  const EYE = light ? 0.3 : 0.15;
  const tex = glowTex(), eyes = [-1, 1].map(sd => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map:tex, color:'#bffcff' })));
    const [ex, ey, ez] = headPt(sd * 0.36, Math.acos(0.13 / 1.02), 0); s.position.set(ex, ey, ez + 0.02); s.scale.setScalar(EYE); s.userData.keep = true; head.add(s); return s;
  });

  // кольцо развёртки, бегущее по голове
  const scan = add(new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 48), new THREE.MeshBasicMaterial(additive({ color:CYAN, opacity:0.5, side:THREE.DoubleSide }))), 0, HEAD_Y, 0);
  scan.rotation.x = -Math.PI / 2;

  // лучи к агентам, о которых идёт речь
  const beams = [];
  const beamMat = () => new THREE.LineBasicMaterial(additive({ color:CYAN, opacity:0 }));
  function beam(get) {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 24), 3));
    const line = new THREE.Line(g, beamMat()); line.frustumCulled = false; line.userData.keep = true; scene.add(line);
    const dot = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map:tex, color:'#bffcff', opacity:0 }))); dot.scale.setScalar(0.35); dot.userData.keep = true; scene.add(dot);
    beams.push({ get, line, dot, born:clock, life:9 });
  }

  let shown = 0, want = 0, state = 'idle', level = 0, mouth = 0, glitch = 0, blinkAt = 3, clock = 0, scatter = 0;
  let yaw = 0, pitch = 0, lookTarget = null;
  const tmp = new THREE.Vector3(), headW = new THREE.Vector3();

  function update(dt, camera) {
    clock += dt;
    shown += (want - shown) * (1 - Math.exp(-dt * (want ? 2.2 : 4)));
    root.visible = shown > 0.01;
    if (!root.visible) { for (const b of beams) b.line.visible = b.dot.visible = false; return; }
    const t = clock;
    mouth += ((state === 'speak' ? level * (0.55 + 0.45 * Math.sin(t * 17)) : 0) - mouth) * 0.4;
    scatter *= Math.exp(-dt * 3);
    if (Math.random() < (state === 'think' ? 0.06 : 0.008)) glitch = 1; glitch *= Math.exp(-dt * 10);
    head.position.y = HEAD_Y + Math.sin(t * 1.1) * 0.05;

    // куда смотрит: на агента, о котором говорит, иначе на камеру
    head.getWorldPosition(headW);
    const target = lookTarget ? lookTarget() : camera.position;
    if (target) {
      tmp.copy(target).sub(headW);
      const ty = Math.atan2(tmp.x, tmp.z) - root.rotation.y, tp = -Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z));
      yaw += Math.atan2(Math.sin(ty - yaw), Math.cos(ty - yaw)) * (1 - Math.exp(-dt * 3));
      pitch += (Math.max(-0.5, Math.min(0.5, tp)) - pitch) * (1 - Math.exp(-dt * 3));
    }
    head.rotation.set(pitch * 0.6, yaw + Math.sin(t * 0.4) * 0.08, 0);

    // точки: проявляются снизу вверх, на касание рассыпаются, на помехах сдвигаются полосой
    const rise = shown * 1.15, band = Math.sin(t * 40) * 0.8;
    let k = 0;
    for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++, k++) {
      const th = -Math.PI + i / NI * 6.283, ph = 0.1 + j / (NJ - 1) * 2.45;
      let [x, y, zz, feat] = headPt(th, ph, mouth);
      const vis = (y + 1.05) / 2.1 < rise ? 1 : 0;
      const s3 = k * 3, sc = scatter + (1 - shown) * 0.6;
      x += jit[s3] * sc; y += jit[s3 + 1] * sc; zz += jit[s3 + 2] * sc;
      if (glitch > 0.2 && Math.abs(y - band) < 0.12) x += glitch * 0.15;
      pos[s3] = x; pos[s3 + 1] = vis ? y : -HEAD_Y / HEAD_S; pos[s3 + 2] = zz;
      // у макушки точки сходятся — гасим их, чтобы не было засвета; затылок почти прозрачный
      alp[k] = vis * Math.min(1, Math.sin(ph) * (zz > 0 ? 0.22 + zz * 0.55 : 0.05) + feat * 16) * (0.88 + 0.12 * Math.sin(t * 9 + j * 0.7));
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
    ptsMat.uniforms.uO.value = Math.min(1, shown * 1.2); ptsMat.uniforms.uH.value = innerHeight * Math.min(devicePixelRatio || 1, 2);

    // моргание и глаза
    if (t > blinkAt) blinkAt = t + 2.5 + Math.random() * 4;
    const bl = blinkAt - t < 0.15 ? Math.sin((blinkAt - t) / 0.15 * Math.PI) : 0;
    for (const e of eyes) { e.scale.set(EYE * (state === 'think' ? 1.25 : 1), EYE * (1 - bl * 0.9), 1); e.material.opacity = shown * (light ? 0.75 + level * 0.25 : 0.25 + level * 0.25); }

    coneMat.uniforms.uA.value = shown * (0.8 + level * 0.5); coneMat.uniforms.uT.value = t;
    ring.material.opacity = shown * (0.6 + 0.4 * Math.sin(t * 3)); lens.material.opacity = shown * (0.35 + level * 0.4);
    const sp = state === 'think' ? 1.6 : 0.45, f = (t * sp) % 1;
    scan.position.y = HEAD_Y + (f - 0.5) * 1.1 * HEAD_S * 2; scan.material.opacity = shown * 0.4 * Math.sin(f * Math.PI);
    scan.scale.setScalar(0.6 + Math.sin(f * Math.PI) * 0.5);

    // лучи: от головы к агенту, по лучу бежит огонёк
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i], age = clock - b.born, p = b.get();
      const a = Math.min(1, age * 2) * Math.min(1, (b.life - age) / 1.5) * shown;
      if (age > b.life || !p) { scene.remove(b.line, b.dot); b.line.geometry.dispose(); beams.splice(i, 1); continue; }
      const arr = b.line.geometry.attributes.position.array;
      for (let s = 0; s < 24; s++) {
        const u = s / 23; tmp.lerpVectors(headW, p, u); tmp.y += Math.sin(u * Math.PI) * 0.8;
        arr[s * 3] = tmp.x; arr[s * 3 + 1] = tmp.y; arr[s * 3 + 2] = tmp.z;
      }
      b.line.geometry.attributes.position.needsUpdate = true; b.line.material.opacity = a * 0.9; b.line.visible = true;
      const u = (age * 0.7) % 1; tmp.lerpVectors(headW, p, u); tmp.y += Math.sin(u * Math.PI) * 0.8;
      b.dot.position.copy(tmp); b.dot.material.opacity = a; b.dot.visible = true;
    }
  }

  return {
    root, update,
    get visible() { return want === 1; },
    show() { want = 1; },
    hide() { want = 0; lookTarget = null; },
    state(s) { state = s; },
    level(l) { level = l; },
    poke() { scatter = 0.9; },
    // смотреть на агента и тянуть к нему луч; get() → Vector3 в мире или null
    point(gets) { gets.slice(0, 4).forEach(g => beam(g)); lookTarget = gets[0] || null; setTimeout(() => { if (lookTarget === gets[0]) lookTarget = null; }, 6000); },
    center:() => headW.clone(),
  };
}
