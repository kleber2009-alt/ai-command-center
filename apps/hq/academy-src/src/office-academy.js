/* ================= АКАДЕМИЯ: кабинет ученика внутри офиса =================
   Офис стартует пустым: в холле только проводник. Модули — комнаты, шаги — пустые столы
   с меткой. Сдал шаг — агент появляется за своим столом. Логику трека, ответы и файлы
   ведёт window.ACADEMY_APP (academy-app.js); здесь — только 3D: замки, метки, найм. */

const AC = window.ACADEMY_APP || null;
const GAME = null;                                   // старый игровой режим в этой сборке выключен
const GUIDE_C = '#2f7bff';
const RECEPTION = V3(1.1, 1.0, ZC - 2.7);
const ACA = AC ? { pending:new Set(), guide:null, markers:new Map(), busy:false } : null;
const wait = ms => new Promise(r => setTimeout(r, ms));

if (ACA) {
  document.body.classList.add('academy');
  const lockMat = new THREE.MeshBasicMaterial({ color:'#161a22', transparent:true, opacity:0.62, depthWrite:false });
  for (const r of rooms.values()) {
    const lock = new THREE.Mesh(new THREE.BoxGeometry(RW - 0.25, H - 0.05, ZG - ZB - 0.05), lockMat.clone());
    lock.position.set(0, H/2, (ZB + ZG)/2); r.P.add(lock); r.lock = lock;
  }
  const gb = makeBot({ color:GUIDE_C, status:'working' });
  gb.g.scale.setScalar(1.25); gb.g.position.copy(RECEPTION); building.add(gb.g);
  gb.ringMat.color.set(GUIDE_C).multiplyScalar(2.5);
  const gel = document.createElement('div'); gel.className = 'lbl guide'; gel.innerHTML = '<i></i><b>Проводник</b>';
  gel.style.setProperty('--s', GUIDE_C); gel.style.setProperty('--c', GUIDE_C);
  gel.addEventListener('click', e => { e.stopPropagation(); AC.onGuide(); });
  const glabel = new CSS2DObject(gel); glabel.position.y = 0.95; gb.g.add(glabel);
  ACA.guide = { ...gb, path:null, start:0, dur:1 };

  // пустые места будущих агентов: тусклый круг на полу, пока агента не наняли
  const spotMat = new THREE.MeshBasicMaterial({ color:'#9aa4b8', transparent:true, opacity:0.38, depthWrite:false });
  members.forEach(m => {
    if (m.kind !== 'bot') return;
    const sp = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.3, 48), spotMat);
    sp.rotation.x = -Math.PI/2; sp.position.set(m.g.position.x, 0.02, m.g.position.z);
    m.g.parent.add(sp); m.spot = sp;
  });

  const _enter = enter;
  enter = (id, flyCam = true) => {
    const d = deptOf(id);
    if (d && !AC.roomOpen(d.id) && !ACA.busy) return AC.toast(AC.roomLockedText(d.id));
    _enter(id, flyCam);
  };
  const _applyMode = applyMode;
  applyMode = () => { _applyMode(); academyEnforce(); };
  const _renderUI = renderUI;
  renderUI = () => {
    _renderUI();
    for (const r of rooms.values()) {
      r.el.innerHTML = AC.roomOpen(r.d.id)
        ? `<b>${esc(r.d.name)}</b><small>${esc(AC.roomSummary(r.d.id))}</small><div class="row2"><em>Войти →</em></div>`
        : `<b>${esc(r.d.name)}</b><small>Закрыто · ${esc(AC.roomLockedShort(r.d.id))}</small>`;
    }
    [...$('tabs').children].forEach(b => b.classList.toggle('locked', !!deptOf(b.dataset.go) && !AC.roomOpen(b.dataset.go)));
  };
  renderCard = () => {
    const m = selected && members.get(selected);
    $('card').hidden = !m;
    document.body.classList.toggle('has-card', !!m);
    if (!m) return;
    const { data, dept, kind } = m;
    if (kind === 'head') {
      $('cAv').innerHTML = faceHTML(data, dept.accent);
      $('cName').textContent = data.name;
      $('cRole').textContent = data.title;
      $('cTaskT').textContent = 'Команда отдела';
      $('cTask').textContent = AC.roomSummary(dept.id);
      $('cMain').textContent = 'Команда и регламенты';
    } else {
      $('cAv').innerHTML = `<span class="av" style="--c:${esc(data.color)}"></span>`;
      $('cName').textContent = data.name;
      $('cRole').textContent = `${data.role} · руководитель: ${dept.head.name}`;
      $('cTaskT').textContent = 'Регламент';
      $('cTask').textContent = AC.agentWhen(data.id);
      $('cMain').textContent = 'Регламент и промпт';
    }
    $('cDemo').hidden = true;
  };
  $('cMain').onclick = () => { const m = selected && members.get(selected); if (!m) return; m.kind === 'head' ? AC.openTeam() : AC.openAgent(m.data.id); };
}

function academyEnforce() {
  if (!ACA) return;
  const hired = AC.hired();
  members.forEach(m => {
    const on = (m.kind === 'bot' ? hired.has(m.data.id) : AC.roomOpen(m.dept.id)) && !ACA.pending.has(m.data.id);
    if (!m.spawnAt) m.g.visible = on;
    if (!on) m.label.visible = false;
    else m.label.visible = m.dept.id === mode;
    if (m.spot) m.spot.visible = !on && AC.roomOpen(m.dept.id);
  });
  for (const r of rooms.values()) if (!r.unlocking) r.lock.visible = !AC.roomOpen(r.d.id);
  const cur = AC.currentStepId();
  if (cur && !ACA.markers.has(cur)) makeMarker(cur);
  ACA.markers.forEach((mk, id) => {
    const show = id === cur && !ACA.busy && (mk.room === 'hall' || AC.roomOpen(mk.room));
    mk.obj.visible = show; mk.ring.visible = show;
    if (mk.ghost) { mk.ghost.visible = show; mk.beam.visible = show; }
    mk.el.classList.toggle('far', mode !== 'plan' && mk.room !== mode);
  });
}
function deskOf(step) {
  if (!step.agent || !members.has(step.agent)) return { parent:building, pos:V3(0, 0, ZC - 1.6), room:'hall' };
  const m = members.get(step.agent);
  return { parent:m.g.parent, pos:m.g.position.clone(), room:m.dept.id };
}
function makeMarker(id) {
  const step = AC.stepOf(id); if (!step) return;
  const d = deskOf(step);
  const el = document.createElement('div');
  el.className = 'qm';
  el.innerHTML = `<b>!</b><span><em>${esc(step.id)}</em>${esc(step.agent ? 'Нанять «' + step.title + '»' : step.title)}</span>`;
  el.addEventListener('click', e => { e.stopPropagation(); AC.openStep(step.id); });
  const obj = new CSS2DObject(el);
  obj.position.copy(d.pos).add(V3(0, d.room === 'hall' ? 1.75 : 0.95, 0));
  d.parent.add(obj);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 64), new THREE.MeshBasicMaterial({ color:new THREE.Color('#ffb020').multiplyScalar(2.2), transparent:true, opacity:0.9 }));
  ring.rotation.x = Math.PI/2;
  ring.position.set(d.pos.x, 0.03, d.pos.z + (d.room === 'hall' ? 0.9 : 0));
  d.parent.add(ring);
  let ghost = null, beam = null, gm = null;
  if (d.room !== 'hall') {
    // голограмма будущего агента: видно, кто здесь появится после шага
    gm = new THREE.MeshBasicMaterial({ color:new THREE.Color('#ffb020').multiplyScalar(1.25), transparent:true, opacity:0.3, depthWrite:false });
    ghost = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 20), gm); head.scale.set(1.1, 0.93, 1); head.position.y = 0.37;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), gm); tip.position.y = 0.61;
    ghost.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.2, 8, 24), gm), head, tip);
    ghost.position.copy(d.pos); d.parent.add(ghost);
    const hgt = Math.max(0.2, d.pos.y - 0.36);
    const bg = new THREE.CylinderGeometry(0.3, 0.3, hgt, 40, 4, true), bp = bg.attributes.position, bc = [];
    for (let i = 0; i < bp.count; i++) { const k = (bp.getY(i) + hgt/2) / hgt; bc.push(1, 1, 1, Math.pow(THREE.MathUtils.clamp(1 - k, 0, 1), 1.6)); }   // clamp: pow(-0, …) даёт NaN и чернит кадр через bloom   // свет гаснет кверху
    bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 4));
    beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color:new THREE.Color('#ffb020').multiplyScalar(1.6), vertexColors:true, transparent:true, opacity:0.3, side:THREE.DoubleSide, depthWrite:false }));
    beam.position.set(d.pos.x, 0.03 + hgt/2, d.pos.z); d.parent.add(beam);
  }
  ACA.markers.set(id, { obj, ring, el, room:d.room, ghost, beam, gm, baseY:d.pos.y });
}
function dropMarker(id) {
  const mk = ACA.markers.get(id); if (!mk) return;
  [mk.obj, mk.ring, mk.ghost, mk.beam].forEach(o => o && o.parent && o.parent.remove(o));
  mk.el.remove(); ACA.markers.delete(id);
}
// откуда смотреть на место агента: самая свободная сторона комнаты, лучше спереди
function deskSpot(step) {
  const d = deskOf(step), dept = deptOf(d.room), m = members.get(step.agent);
  const w = d.parent.localToWorld(d.pos.clone()), pt = portrait(), far = pt ? 4.6 : 3.6;
  const face = new THREE.Vector3(); m.g.getWorldDirection(face); face.y = 0; face.normalize();
  const x0 = dept.ox - RW/2 + 0.45, x1 = dept.ox + RW/2 - 0.45, z0 = ZB + 0.6, z1 = ZG - 0.3;
  let best = null;
  for (let i = -8; i <= 8; i++) {   // в комнате OrbitControls держит азимут в ±1.15 рад — ищем внутри
    const a = i / 8 * 1.1, dir = V3(Math.sin(a), 0, Math.cos(a));
    let t = far;
    if (dir.x > 1e-6) t = Math.min(t, (x1 - w.x) / dir.x); else if (dir.x < -1e-6) t = Math.min(t, (x0 - w.x) / dir.x);
    if (dir.z > 1e-6) t = Math.min(t, (z1 - w.z) / dir.z); else if (dir.z < -1e-6) t = Math.min(t, (z0 - w.z) / dir.z);
    const score = t / far + 0.3 * dir.dot(face) + 0.2 * dir.z;
    if (!best || score > best.score) best = { score, dir, t:Math.max(1.4, t) };
  }
  return { w, dept, pt, dir:best.dir, t:best.t };
}
function deskView(step) {
  const s = deskSpot(step), target = V3(s.w.x, s.w.y + (s.pt ? 0.1 : 0), s.w.z);
  return { target, pos:target.clone().addScaledVector(s.dir, s.t).add(V3(0, s.pt ? 0.7 : 0.9, 0)) };
}
function guideSpot(step) {
  const s = deskSpot(step), right = V3(s.dir.z, 0, -s.dir.x);
  const p = s.w.clone().addScaledVector(right, s.pt ? -0.85 : -1.05).addScaledVector(s.dir, -0.3);   // слева и чуть за местом — не загораживает
  p.x = THREE.MathUtils.clamp(p.x, s.dept.ox - RW/2 + 0.5, s.dept.ox + RW/2 - 0.5);
  p.z = THREE.MathUtils.clamp(p.z, ZB + 0.5, ZG - 0.4); p.y = 1.0;
  return p;
}
function guideWalk(points, ms) { Object.assign(ACA.guide, { path:[ACA.guide.g.position.clone(), ...points], start:performance.now(), dur:ms }); }
function guidePathTo(step) {
  const d = deskOf(step), g = ACA.guide.g.position;
  if (d.room === 'hall') return [V3(g.x, 1.0, ZG + 1.7), RECEPTION.clone()];
  const dept = deptOf(d.room);
  const inRoom = Math.abs(g.x - dept.ox) < RW/2 - 0.2 && g.z < ZG;
  const near = guideSpot(step);
  return inRoom ? [near] : [V3(g.x, 1.0, ZG + 1.7), V3(dept.ox + 3.0, 1.0, ZG + 1.7), V3(dept.ox + 3.0, 1.0, ZG - 0.6), near];
}
async function academyFocusStep(id, walk = true) {
  const step = AC.stepOf(id); if (!step || !ACA) return;
  const d = deskOf(step);
  if (d.room === 'hall') {
    if (mode !== 'plan') toPlan();
    if (walk) guideWalk(guidePathTo(step), 1400);
    return;
  }
  const dept = deptOf(d.room);
  if (mode !== dept.id) { mode = dept.id; selected = null; applyMode(); members.forEach(paintMember); renderUI(); }
  if (walk) { const p = guidePathTo(step); guideWalk(p, 900 + p.length * 450); }
  const v = deskView(step); flyTo(v.pos, v.target, 1.2);
}
function spawnMember(m) {
  ACA.pending.delete(m.data.id);
  m.spawnAt = performance.now(); m.g.visible = true; m.g.scale.setScalar(0.001);
  const fx = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color:new THREE.Color(m.dept.accent).multiplyScalar(2.2), transparent:true }));
  fx.rotation.x = Math.PI/2; fx.position.copy(m.g.position); fx.position.y = m.kind === 'head' ? 0.05 : m.g.position.y - 0.36;
  m.g.parent.add(fx); m.fx = fx;
  m.label.visible = m.dept.id === mode;
}
async function academyUnlock(deptId) {
  const d = deptOf(deptId), r = d && rooms.get(d.id); if (!r) return;
  const head = members.get(d.head.id);
  if (head) ACA.pending.add(head.data.id);
  academyEnforce();
  mode = d.id; selected = null; applyMode();
  const v = roomView(d); flyTo(v.pos, v.target, 1.3); members.forEach(paintMember); renderUI();
  r.unlocking = performance.now();
  await wait(900);
  if (head) spawnMember(head);
  academyEnforce();
}
async function academyHire(id) {
  const m = members.get(id); if (!m || !ACA) return;
  ACA.pending.add(id); ACA.busy = true; academyEnforce();
  if (mode !== m.dept.id) { mode = m.dept.id; selected = null; applyMode(); renderUI(); }
  const v = deskView({ agent:id }); flyTo(v.pos.clone().lerp(v.target, 0.22), v.target, 0.9);
  await wait(900);
  spawnMember(m);
  await wait(900);
  ACA.busy = false;
  dropMarker(AC.lastStepOf(id));
  academyEnforce(); renderUI();
}
function academySync() {
  if (!ACA) return;
  for (const d of DEPTS) {
    const h = AC.head(d.id);
    if (h) { d.head.name = h.name; d.head.title = h.title; const m = members.get(d.head.id); if (m) paintMember(m); }
  }
  $('brandName').textContent = AC.brand();
  document.title = 'Академия AICEX — ' + AC.brand();
  [...ACA.markers.keys()].forEach(id => { if (id !== AC.currentStepId()) dropMarker(id); });
  const last = AC.guideStep();
  if (last && !ACA.guide.path) {
    const step = AC.stepOf(last), d = deskOf(step);
    if (d.room === 'hall') ACA.guide.g.position.copy(RECEPTION);
    else ACA.guide.g.position.copy(guideSpot(step));
  }
  academyEnforce(); renderUI();
}
function academyTick(t, now) {
  if (!ACA) return;
  const G = ACA.guide;
  if (G.path) {
    const k = Math.min(1, (now - G.start) / G.dur), e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2)/2;
    const seg = G.path.slice(1).map((p, i) => p.distanceTo(G.path[i])), tot = seg.reduce((a, b) => a + b, 0);
    let dist = tot * e, i = 0;
    while (i < seg.length - 1 && dist > seg[i]) { dist -= seg[i]; i++; }
    const a = G.path[i], b = G.path[i + 1], p = a.clone().lerp(b, seg[i] ? Math.min(1, dist / seg[i]) : 1);
    G.g.position.copy(p);
    if (b.distanceTo(a) > 1e-3) G.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    if (k >= 1) G.path = null;
  } else {
    // пришёл — поворачивается к ученику
    const want = Math.atan2(camera.position.x - G.g.position.x, camera.position.z - G.g.position.z);
    G.g.rotation.y += Math.atan2(Math.sin(want - G.g.rotation.y), Math.cos(want - G.g.rotation.y)) * 0.08;
  }
  G.g.position.y = 1.0 + Math.sin(t*2.2)*0.04;
  G.ring.rotation.z = t*1.2; G.ring.scale.setScalar(1 + Math.sin(t*4)*0.08);
  members.forEach(m => {
    if (!m.spawnAt) return;
    const k = Math.min(1, (now - m.spawnAt) / 700), c = 1.70158, s = 1 + (c + 1)*Math.pow(k - 1, 3) + c*Math.pow(k - 1, 2);
    m.g.scale.setScalar(Math.max(0.001, s));
    if (m.fx) { m.fx.scale.setScalar(1 + k*2.2); m.fx.material.opacity = 1 - k; if (k >= 1) { m.fx.parent.remove(m.fx); m.fx = null; } }
    if (k >= 1) { m.spawnAt = 0; m.g.scale.setScalar(1); }
  });
  for (const r of rooms.values()) if (r.unlocking) {
    const k = Math.min(1, (now - r.unlocking) / 900);
    r.lock.material.opacity = 0.62 * (1 - k);
    if (k >= 1) { r.unlocking = 0; r.lock.visible = false; r.lock.material.opacity = 0.62; }
  }
  ACA.markers.forEach(mk => {
    if (!mk.ring.visible) return;
    const s = 1 + Math.sin(t*3.2)*0.12; mk.ring.scale.set(s, s, s); mk.ring.material.opacity = 0.6 + Math.sin(t*3.2)*0.3;
    if (mk.ghost) { mk.ghost.rotation.y = t*0.8; mk.ghost.position.y = mk.baseY + Math.sin(t*2.2)*0.05; mk.gm.opacity = 0.26 + Math.sin(t*3.2)*0.08; mk.beam.material.opacity = 0.28 + Math.sin(t*3.2)*0.1; }
  });
}
