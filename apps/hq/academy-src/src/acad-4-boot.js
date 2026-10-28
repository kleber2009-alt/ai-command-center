// ---------- Step flow ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function openStep(id) {
  if (!S.profile && MODE !== 'demo') return showOnboarding();
  const s = STEP[id]; if (!s) return;
  if (!isOpenStep(id)) { const c = currentStep(); toast('Это место откроется позже. Сейчас — шаг ' + c.id + ' «' + c.title + '».'); return; }
  closeModal();
  UI.view = 'step'; UI.step = id; UI.panel = true;
  touch();
  S.guideAt = id;
  renderAll();
  if (window.OFFICE) { window.OFFICE.resize(); window.OFFICE.focusStep(id, true); }
}
let ansTimer = null;
function onAnswer(el) {
  const id = el.getAttribute('data-ans'), q = el.getAttribute('data-q'), x = st(id);
  (x.answers || (x.answers = {}))[q] = el.value;
  clearTimeout(ansTimer); ansTimer = setTimeout(() => { touch(); save(); }, 700);
}
function saveAnswers(id) {
  const s = STEP[id], x = st(id), a = x.answers || (x.answers = {});
  const empty = s.questions.find((q) => String(a[q.id] || '').trim().length < 2);
  if (empty) { toast('Ответь на все вопросы. Не знаешь — жми «Не знаю» или «Отвечу позже».'); const el = $('#aq-' + id.replace('.', '-') + '-' + empty.id); if (el) el.focus(); return; }
  x.answered = true;
  if (!x.xpAns) { x.xpAns = true; addXP(A.xp.answers, 'ответы в проекте'); }
  touch(); save(); renderHUD(); setStage(id, 'gifts');
}
async function suggest(id, qid) {
  const s = STEP[id], q = s.questions.find((y) => y.id === qid), k = id + ':' + qid;
  UI.sugg[k] = { busy: true }; renderPanel();
  try { const list = await aiSuggest(s, q, String(answersOf(id)[qid] || '')); UI.sugg[k] = list.length ? { list: list } : { err: 'ИИ не придумал вариантов. Напиши пару слов и нажми ещё раз.' }; }
  catch (e) { UI.sugg[k] = { err: aiError(e) || 'Не получилось.' }; }
  renderPanel();
}
function pick(id, qid, i) {
  const k = id + ':' + qid, sg = UI.sugg[k]; if (!sg || !sg.list) return;
  const x = st(id), a = x.answers || (x.answers = {}), cur = String(a[qid] || '').trim();
  a[qid] = cur ? cur + '\n' + sg.list[i] : sg.list[i];
  const el = $('#aq-' + id.replace('.', '-') + '-' + qid); if (el) el.value = a[qid];
  UI.sugg[k] = null; save(); renderPanel();
}
function setAnswer(id, qid, text, append) {
  const x = st(id), a = x.answers || (x.answers = {}), cur = String(a[qid] || '').trim();
  a[qid] = append && cur ? cur + '\n' + text : text;
  const el = $('#aq-' + id.replace('.', '-') + '-' + qid); if (el) el.value = a[qid];
  save(); renderPanel();
}
function takeGifts(id) {
  const x = st(id);
  x.giftsTaken = true;
  if (!x.xpGift) { x.xpGift = true; addXP(A.xp.gifts, 'решения в «Решениях»'); }
  touch(); save(); renderHUD(); setStage(id, 'work');
}
async function checkResult(id) {
  const s = STEP[id], x = st(id);
  const el = $('[data-res="' + id + '"]'); if (el) x.result = el.value;
  const r = String(x.result || '').trim();
  if (!r) { toast(s.task.resultType === 'link' ? 'Вставь ссылку на результат.' : 'Вставь результат из Claude.'); if (el) el.focus(); return; }
  UI.err[id] = null; UI.busy['chk-' + id] = true; renderPanel();
  let c;
  if (aiOn()) {
    try { c = await aiCheck(s, r); }
    catch (e) { const m = aiError(e); if (!aiOn()) c = localCheck(s, r); else { UI.busy['chk-' + id] = false; UI.err[id] = m; renderPanel(); return; } }
  } else c = localCheck(s, r);
  c.at = Date.now(); x.check = c; UI.busy['chk-' + id] = false;
  if (accepted(c) && !x.xpTask) { x.xpTask = true; addXP(A.xp.task, 'задание принято'); }
  touch(); save(); renderAll();
}
function saveReg(id) {
  const x = st(id), r = Object.assign({}, regOf(id));
  $$('[data-reg="' + id + '"]').forEach((el) => { r[el.getAttribute('data-k')] = el.value.trim(); });
  x.reg = r; x.regSaved = true;
  if (!x.xpReg) { x.xpReg = true; addXP(A.xp.regulation, 'регламент утверждён'); }
  touch(); save(); renderHUD(); setStage(id, 'hire');
}
async function completeStep(id) {
  const s = STEP[id], x = st(id);
  if (x.hired || UI.busy.hire) return;
  const before = {};
  ['ceo', 'marketing', 'sales', 'traffic'].forEach((r) => { before[r] = roomOpen(r); });
  UI.busy.hire = true; renderPanel();
  x.hired = true; x.hiredAt = Date.now();
  if (s.boss && !x.boss) x.boss = { status: 'todo', due: Date.now() + s.boss.days * 864e5 };
  if (id === '0.1') giveBadge('office-open');
  if (s.agent && hiredSet().size === 1) giveBadge('first-agent');
  if (STEPS.filter((t) => t.module === 2).every((t) => isDone(t.id))) giveBadge('content-factory');
  if (s.ownSkill) giveBadge('own-skill');
  const next = currentStep();
  const newRoom = next && next.room !== 'hall' && !before[next.room] ? next.room : null;
  if (newRoom) UI.holdRoom = newRoom;
  touch(); save();
  if (window.OFFICE && s.agent) { await window.OFFICE.hire(s.agent); toast('Нанят агент «' + s.title + '»', 'hire'); }
  if (newRoom) {
    await wait(350);
    UI.holdRoom = null;
    if (window.OFFICE) await window.OFFICE.unlock(newRoom);
    toast('Открыт отдел «' + roomName(newRoom) + '» · модуль ' + next.module + ' «' + MOD[next.module].title + '»', 'hire');
  }
  UI.holdRoom = null; UI.busy.hire = false;
  if (window.OFFICE) window.OFFICE.sync();
  renderAll();
}
function toMentor(id) {
  if (MODE !== 'cloud') { toast('Наставник доступен, когда офис открыт в claude.ai.'); return; }
  openModal('<div class="adh"><b class="h2">Спросить наставника</b><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div><p class="mut sm" style="margin:0">Наставник увидит задание, твой результат и проверку. Ответ — в течение 24 часов.</p>' +
    '<div class="reg"><label for="amnote">Что не получается?</label><textarea class="ta" id="amnote" rows="3"></textarea></div><div class="row"><button class="ab pri" data-act="mentor-send" data-id="' + id + '">Отправить</button><button class="ab ghost" data-act="close">Отмена</button></div>');
}
async function mentorSend(id) {
  const s = STEP[id], x = st(id);
  try {
    await RT.db.doc('mentor/' + RT.uid).set({ v: 2, step: id, title: s.title, result: String(x.result || '').slice(0, 8000), answers: clone(x.answers || {}), check: clone(x.check || {}), note: (($('#amnote') || {}).value || '').trim(), at: Date.now(), status: 'open' });
    x.mentor = 'open'; save(); closeModal(); toast('Отправили наставнику'); renderPanel();
  } catch (e) { toast('Не получилось отправить. Попробуй ещё раз.'); }
}

// ---------- API for the 3D office ----------
window.ACADEMY_APP = {
  roomOpen: (d) => roomOpen(d),
  roomLockedText: (d) => { const s = firstStepOfRoom(d); return 'Отдел «' + roomName(d) + '» откроется в модуле ' + s.module + ' «' + MOD[s.module].title + '»'; },
  roomLockedShort: (d) => 'модуль ' + firstStepOfRoom(d).module,
  roomSummary: (d) => { const all = STEPS.filter((s) => s.room === d && s.agent), n = all.filter((s) => isDone(s.id)).length; return 'руководитель ' + headOf(d) + ' · агентов ' + n + ' из ' + all.length; },
  hired: () => hiredSet(),
  currentStepId: () => { if (!S.profile && MODE !== 'demo') return '0.1'; const c = currentStep(); return c ? c.id : null; },
  stepOf: (id) => STEP[id],
  lastStepOf: (a) => (STEPS.find((s) => s.agent === a) || {}).id,
  head: (d) => ({ name: headOf(d), title: headOf(d) === myName() ? 'Руководитель отдела — ты' : 'Руководитель отдела' }),
  brand: () => brand(),
  guideStep: () => S.guideAt || '0.1',
  agentWhen: (a) => { const s = STEPS.find((x) => x.agent === a); return s ? regOf(s.id).when || '' : ''; },
  openStep: (id) => openStep(id),
  openAgent: (a) => showAgent(a),
  openTeam: () => showTeam(),
  onGuide: () => { if (!S.profile && MODE !== 'demo') return showOnboarding(); const c = currentStep(); if (c) openStep(c.id); },
  toast: (m) => toast(m)
};

// ---------- Actions ----------
const ACT = {
  close: () => closeModal(),
  term: (t) => showTerm(t),
  'panel-off': () => setPanel(false),
  'panel-on': () => setPanel(true),
  track: () => { UI.view = 'track'; UI.step = null; renderPanel(); },
  plan: () => { if (window.OFFICE) window.OFFICE.toPlan(); },
  'open-step': (t) => openStep(t.dataset.id),
  focus: (t) => { if (window.OFFICE) window.OFFICE.focusStep(t.dataset.id, true); },
  stage: (t) => { if (!t.disabled) setStage(t.dataset.id, t.dataset.k); },
  'to-questions': (t) => { st(t.dataset.id).seen = true; save(); setStage(t.dataset.id, 'questions'); },
  dunno: (t) => { const k = t.dataset.id + ':' + t.dataset.q; UI.help[k] = !UI.help[k]; renderPanel(); },
  example: (t) => { const k = t.dataset.id + ':' + t.dataset.q; UI.show[k] = !UI.show[k]; renderPanel(); },
  suggest: (t) => suggest(t.dataset.id, t.dataset.q),
  pick: (t) => pick(t.dataset.id, t.dataset.q, Number(t.dataset.i)),
  later: (t) => { setAnswer(t.dataset.id, t.dataset.q, '(отвечу позже)'); UI.help[t.dataset.id + ':' + t.dataset.q] = false; renderPanel(); },
  'use-template': (t) => { const q = STEP[t.dataset.id].questions.find((y) => y.id === t.dataset.q); setAnswer(t.dataset.id, t.dataset.q, plain(q.help[Number(t.dataset.i)].text), true); },
  'copy-help': (t) => { const q = STEP[t.dataset.id].questions.find((y) => y.id === t.dataset.q); copyText(fill(q.help[Number(t.dataset.i)].prompt, answersOf(t.dataset.id))); },
  'answers-save': (t) => saveAnswers(t.dataset.id),
  'gifts-take': (t) => takeGifts(t.dataset.id),
  template: (t) => showTemplate(t.dataset.id, Number(t.dataset.i)),
  'copy-template': (t) => { const g = STEP[t.dataset.id].gifts[Number(t.dataset.i)]; copyText(fill(g.text, answersOf(t.dataset.id))); },
  'copy-prompt': (t) => copyText(fill(STEP[t.dataset.id].task.prompt, answersOf(t.dataset.id))),
  'copy-claude': () => copyText(claudeMd()),
  check: (t) => checkResult(t.dataset.id),
  stuck: (t) => { const k = 'stuck:' + t.dataset.id; UI.help[k] = !UI.help[k]; renderPanel(); },
  'to-mentor': (t) => toMentor(t.dataset.id),
  'mentor-send': (t) => mentorSend(t.dataset.id),
  'reg-save': (t) => saveReg(t.dataset.id),
  'edit-reg': (t) => { openStep(t.dataset.id); setStage(t.dataset.id, 'regulation'); },
  hire: (t) => completeStep(t.dataset.id),
  boss: (t) => bossModal(t.dataset.id),
  'boss-send': (t) => bossSend(t.dataset.id),
  project: () => showProject(UI.file),
  file: (t) => showProject(t.dataset.path),
  'copy-file': (t) => { const f = fileByPath(t.dataset.path); if (f) copyText(f.text()); },
  'skill-code': (t) => showCode(t.getAttribute('data-skill')),
  needs: (t) => showNeeds(t.getAttribute('data-id')),
  transfer: () => showTransfer(),
  'prog-file': () => exportProgress(false),
  'prog-copy': () => exportProgress(true),
  'prog-load': () => { const t = ($('#aprog-text') || {}).value || ''; if (t.trim()) importProgress(t); else toast('Выбери файл прогресса или вставь его текст.'); },
  'prog-ok': () => applyProgress(),
  onb: () => showOnboarding(),
  'dl-file': (t) => { const f = fileByPath(t.dataset.path); if (f) offerFile(f.path.split('/').pop(), f.text()); },
  zip: () => zipProject(),
  library: () => showLibrary(),
  team: () => showTeam(),
  agent: (t) => showAgent(t.dataset.id),
  guides: () => showGuides(),
  guide: (t) => showGuide(t.dataset.id, 0),
  tour: (t) => showGuide(t.dataset.id, Number(t.dataset.i)),
  mentor: () => showMentor(),
  'mentor-ok': (t) => mentorDecide(t.dataset.id, true),
  'mentor-back': (t) => mentorDecide(t.dataset.id, false),
  demo: () => enterDemo(),
  'exit-demo': () => exitDemo(),
  reset: () => resetModal(),
  'reset-ok': () => resetAll()
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) { if (!e.target.closest('.pop')) hidePop(); return; }
  const fn = ACT[t.getAttribute('data-act')]; if (!fn) return;
  if (t.tagName !== 'A') e.preventDefault();
  if (t.getAttribute('data-act') !== 'term') hidePop();
  fn(t, e);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.hasAttribute('data-ans')) onAnswer(t);
  else if (t.hasAttribute('data-res')) { st(t.getAttribute('data-res')).result = t.value; clearTimeout(ansTimer); ansTimer = setTimeout(save, 700); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'aprog-file' && t.files && t.files[0]) { t.files[0].text().then(importProgress, () => toast('Не получилось прочитать файл.')); return; }
  if (t.hasAttribute('data-head')) { S.heads[t.getAttribute('data-head')] = t.value; save(); if (window.OFFICE) window.OFFICE.sync(); toast('Руководитель отдела «' + roomName(t.getAttribute('data-head')) + '» — ' + t.value); }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'aOnb') { e.preventDefault(); startProject(); }
  if (e.target.id === 'aCode') { e.preventDefault(); saveCode(e.target); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { hidePop(); closeModal(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('label[for="aprog-file"]')) { e.preventDefault(); $('#aprog-file').click(); }
});
$('#aModal').addEventListener('click', (e) => { if (e.target.id === 'aModal') closeModal(); });

// ---------- Boot ----------
function renderAll() { renderHUD(); renderPanel(); renderBanner(); }
addEventListener('office:ready', () => { RT.office = true; if (window.OFFICE) window.OFFICE.sync(); });
async function boot() {
  const local = lsLoad();
  if (local && local.v === 2) S = Object.assign(fresh(), local);
  renderAll();
  if (!S.profile) showOnboarding();
  const use = (n) => (window.claude && typeof window.claude.use === 'function') ? Promise.resolve(window.claude.use(n)).catch(() => null) : Promise.resolve(null);
  const caps = await Promise.all(['user', 'db', 'sample', 'downloads'].map(use));
  RT.user = caps[0]; RT.db = caps[1]; RT.sample = caps[2]; RT.downloads = caps[3]; RT.ai = !!RT.sample;
  if (!RT.downloads && !window.claude) RT.downloads = { save: browserSave };
  if (RT.user) { try { const me = await RT.user.me(); RT.me = me; RT.uid = me.id; RT.owner = !!me.isOwner; RT.admin = !!me.canEdit; } catch (e) { /* no identity */ } }
  if (RT.db && RT.uid) {
    try {
      const d = await RT.db.doc('data/users/' + RT.uid + '/state2').get();
      const cs = d.exists ? d.data() : null;
      const inDemo = MODE === 'demo';
      const base = inDemo ? RT.saved : null;
      MODE = 'cloud';
      if (cs && cs.profile) { const real = Object.assign(fresh(), clone(cs)); if (inDemo) base.S = real; else S = real; lsSave(); }
      else if ((inDemo ? base.S : S).profile) cloudWrite('data/users/' + RT.uid + '/state2', clone(inDemo ? base.S : S));
      if (inDemo) { base.MODE = 'cloud'; MODE = 'demo'; }
      else await mentorInbox();
    } catch (e) { if (MODE !== 'demo') MODE = 'local'; }
  }
  RT.ready = true;
  if (S.profile && $('#aModal').querySelector('#aOnb')) closeModal();
  if (RT.me && RT.me.name && $('#aon-name') && !$('#aon-name').value) $('#aon-name').value = RT.me.name.split(' ')[0];
  renderAll();
  if (window.OFFICE) window.OFFICE.sync();
}
boot();
