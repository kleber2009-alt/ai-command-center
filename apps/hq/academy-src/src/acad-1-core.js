// ---------- Catalogue ----------
const A = window.ACADEMY;
const key = (id) => id.split('.').map(Number);
const STEPS = A.steps.slice().sort((a, b) => { const x = key(a.id), y = key(b.id); return x[0] - y[0] || x[1] - y[1]; });
const STEP = {};
STEPS.forEach((s, i) => { s.index = i; STEP[s.id] = s; });
const MOD = {};
A.modules.forEach((m) => { MOD[m.id] = m; });
const CAT = window.AGENT_CATALOG || {};
const STAGES = [['task', 'Задача'], ['questions', 'Вопросы'], ['gifts', 'Решение'], ['work', 'Задание'], ['regulation', 'Регламент'], ['hire', 'Найм']];

// ---------- Utils ----------
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
function dateStr(d) { d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5); }
function isoWeek(s) { const d = new Date(s + 'T12:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + 3); const y = new Date(d.getFullYear(), 0, 4); return d.getFullYear() + '-' + (1 + Math.round(((d - y) / 864e5 - 3 + ((y.getDay() + 6) % 7)) / 7)); }
function ago(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return m + ' ' + plural(m, 'минуту', 'минуты', 'минут') + ' назад';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' ' + plural(h, 'час', 'часа', 'часов') + ' назад';
  const d = Math.round(h / 24);
  return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
}
const when = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slug = (s, fb) => String(s || '').toLowerCase().split('').map((c) => (TR[c] != null ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || fb || 'project';
const isUrl = (s) => /^https?:\/\/\S+\.\S+/.test(String(s || '').trim());

const ICONS = {
  track: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  mentor: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  skill: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
  artifact: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  product: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  connector: '<path d="M9 7V2M15 7V2M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
  template: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ai: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  crown: '<path d="m2 6 4 11h12l4-11-6 5-4-7-4 7z"/><path d="M5 21h14"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  pointer: '<path d="m9 9 5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2 8 5.1M5.1 8l-2.9-.8M14 4.1 12 6M6 12l-1.9 2"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  medal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14.5 7 22l5-3 5 3-1.5-7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = (n, s) => '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

// ---------- Text ----------
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const terms = (h) => h.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, k, d) => '<button type="button" class="term" data-act="term" data-term="' + k + '">' + (d || k) + '</button>');
function rich(t) {
  const lines = String(t || '').split('\n');
  let out = '', list = [];
  const flush = () => { if (list.length) { out += '<ul>' + list.map((x) => '<li>' + x + '</li>').join('') + '</ul>'; list = []; } };
  lines.forEach((l) => { const li = l.match(/^\s*[-•]\s+(.*)$/); if (li) { list.push(terms(inline(li[1]))); return; } flush(); if (l.trim()) out += '<p>' + terms(inline(l)) + '</p>'; });
  flush();
  return '<div class="txt">' + out + '</div>';
}
const plain = (t) => String(t || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, k, d) => d || k);
function mdTable(rows) {
  const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]); let body = rows.slice(1);
  if (body[0] && /^[\s|:-]+$/.test(body[0])) body = body.slice(1);
  return '<div class="tbl"><table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + body.map((r) => '<tr>' + cells(r).map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  const block = (l) => /^(#{1,6}\s|```|\s*[-*]\s+|\s*\d+[.)]\s+|>|\s*\|)/.test(l);
  const link = (s) => inline(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const b = []; i++; while (i < lines.length && !/^```/.test(lines[i])) b.push(lines[i++]); i++; out += '<pre>' + esc(b.join('\n')) + '</pre>'; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const n = Math.min(h[1].length, 3); out += '<h' + n + '>' + inline(h[2]) + '</h' + n + '>'; i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) { const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]); out += mdTable(rows); continue; }
    if (/^\s*[-*]\s+/.test(l)) { out += '<ul>'; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) out += '<li>' + link(lines[i++].replace(/^\s*[-*]\s+/, '')) + '</li>'; out += '</ul>'; continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { out += '<ol>'; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) out += '<li>' + link(lines[i++].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'; out += '</ol>'; continue; }
    if (!l.trim()) { i++; continue; }
    const b = [l]; i++;
    while (i < lines.length && lines[i].trim() && !block(lines[i])) b.push(lines[i++]);
    out += '<p>' + b.map(link).join('<br>') + '</p>';
  }
  return out;
}

// ---------- State ----------
const LS_KEY = 'academy:v2';
const fresh = () => ({ v: 2, profile: null, xp: 0, steps: {}, badges: [], streak: { count: 0, last: null, best: 0, days: [], freezeWeek: null }, heads: {}, guideAt: '0.1', created: Date.now() });
let S = fresh();
let MODE = 'local';                       // local | cloud | demo
const RT = { db: null, user: null, sample: null, downloads: null, uid: null, owner: false, admin: false, me: null, ready: false, ai: false, saved: null, office: false };
const UI = { panel: true, view: 'track', step: null, stage: {}, help: {}, show: {}, sugg: {}, busy: {}, err: {}, holdRoom: null, file: null, tour: null, cohort: null, mentor: null };

const st = (id) => S.steps[id] || (S.steps[id] = {});
const isDone = (id) => !!(S.steps[id] && S.steps[id].hired);
const currentStep = () => STEPS.find((s) => !isDone(s.id)) || null;
const doneCount = () => STEPS.filter((s) => isDone(s.id)).length;
const brand = () => (S.profile && S.profile.project) || 'Мой ИИ-офис';
const myName = () => (S.profile && S.profile.name) || 'Ты';
const hiredSet = () => new Set(STEPS.filter((s) => s.agent && isDone(s.id)).map((s) => s.agent));
const agentName = (id) => (CAT[id] && CAT[id].name) || id;
const roomName = (r) => A.rooms[r] || r;
function roomOpen(room) {
  if (room === 'hall') return true;
  if (UI.holdRoom === room) return false;
  const cur = currentStep();
  return STEPS.some((s) => s.room === room && (isDone(s.id) || (cur && s.id === cur.id)));
}
function firstStepOfRoom(room) { return STEPS.find((s) => s.room === room); }
function rank() {
  let idx = 0;
  A.ranks.forEach((r, i) => { if (S.xp >= r.xp) idx = i; });
  if (idx === A.ranks.length - 1 && !S.badges.includes('autopilot')) idx--;
  return { idx: idx, name: A.ranks[idx].name, xp: A.ranks[idx].xp, next: A.ranks[idx + 1] || null };
}
const stepXP = (s) => A.xp.answers + A.xp.gifts + A.xp.task + A.xp.regulation + (s.boss ? A.xp.boss : 0);
function team() {
  const a = String((S.steps['0.1'] && S.steps['0.1'].answers && S.steps['0.1'].answers.team) || '');
  return a.split(/\n|;|,(?![^(]*\))/).map((x) => x.replace(/^\s*[-•\d.)]+\s*/, '').trim()).filter((x) => x && !/^(только|я сам|никого|нет)\b/i.test(x)).slice(0, 12);
}
const teamNames = () => team().map((x) => x.split(/\s+[—–-]\s+|:\s*/)[0].trim()).filter(Boolean);
function headOf(dept) { return S.heads[dept] || myName(); }

// ---------- Persistence ----------
function lsLoad() { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; } }
function lsSave() { if (MODE === 'demo') return; try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }
const WQ = {};
function cloudWrite(path, data) {
  if (MODE !== 'cloud' || !RT.db) return;
  const q = WQ[path] || (WQ[path] = { busy: false, next: null, tries: 0 });
  q.next = data;
  if (!q.busy) pump(path);
}
async function pump(path) {
  const q = WQ[path];
  if (!q.next) { q.busy = false; return; }
  q.busy = true; const data = q.next; q.next = null;
  try { await RT.db.doc(path).set(data); q.tries = 0; }
  catch (e) {
    const c = e && e.code;
    if (c === 'unavailable' && q.tries < 1) { q.tries++; if (!q.next) q.next = data; await new Promise((r) => setTimeout(r, 900)); }
    else if (c === 'quota_exceeded') toast('Хранилище заполнено. Скачай проект архивом.');
    else if (path.indexOf('data/users/') === 0) { MODE = 'local'; lsSave(); toast('Облако недоступно. Прогресс сохраняется в этом браузере.'); renderHUD(); }
  }
  pump(path);
}
let saveTimer = null, boardTimer = null;
function save() {
  lsSave();
  if (MODE === 'cloud') { clearTimeout(saveTimer); saveTimer = setTimeout(() => cloudWrite('data/users/' + RT.uid + '/state2', clone(S)), 600); }
  if (MODE === 'cloud' && S.profile) {
    clearTimeout(boardTimer);
    boardTimer = setTimeout(() => { const c = currentStep(); cloudWrite('board/' + RT.uid, { xp: S.xp, rank: rank().idx, done: doneCount(), current: c ? c.id : 'finish', agents: hiredSet().size, hidden: !!S.profile.hidden, at: Date.now(), v: 2 }); }, 1500);
  }
}

// ---------- Streak, XP, badges ----------
function touch() {
  const t = dateStr(), sk = S.streak;
  if (sk.last === t) return;
  const gap = sk.last ? daysBetween(sk.last, t) : null, wk = isoWeek(t);
  if (gap === 1) sk.count++;
  else if (gap === 2 && sk.freezeWeek !== wk) { sk.count++; sk.freezeWeek = wk; }
  else sk.count = 1;
  sk.last = t; sk.days = (sk.days || []).concat(t).slice(-21); sk.best = Math.max(sk.best || 0, sk.count);
  if (sk.count >= 7) giveBadge('streak7', A.xp.streak7);
}
function giveBadge(id, xp) {
  if (S.badges.includes(id)) return;
  S.badges.push(id);
  if (xp) S.xp += xp;
  const b = A.badges.find((x) => x.id === id);
  if (b && MODE !== 'demo-build') toast('Значок «' + b.name + '»' + (xp ? ' · +' + xp + ' опыта' : ''), 'xp');
}
function addXP(n, why) {
  const before = rank().idx;
  S.xp += n;
  if (MODE === 'demo-build') return;
  toast('+' + n + ' опыта' + (why ? ' · ' + why : ''), 'xp');
  const r = rank();
  if (r.idx > before) setTimeout(() => toast('Новый ранг: ' + r.name, 'hire'), 700);
}

// ---------- Project files (built from answers, results and regulations) ----------
function fill(text, answers) {
  return String(text || '').replace(/\{\{([^}]+)\}\}/g, (m, k) => {
    if (k === '@project') return brand();
    if (k === '@name') return myName();
    if (k === '@niche') return (S.profile && S.profile.niche) || '';
    const v = String((answers || {})[k] || '').trim();
    return v || '[' + k + ']';
  });
}
const answersOf = (id) => (S.steps[id] && S.steps[id].answers) || {};
const regOf = (id) => Object.assign({}, STEP[id].regulation || {}, (S.steps[id] && S.steps[id].reg) || {});

// ---------- Неделя офиса: расписание агентов из поля «Когда запускать» ----------
const WD = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WD_RX = [/понедельн|(^|[^а-яё])пн([^а-яё]|$)/, /вторник|(^|[^а-яё])вт([^а-яё]|$)/, /сред[уаые]|(^|[^а-яё])ср([^а-яё]|$)/, /четверг|(^|[^а-яё])чт([^а-яё]|$)/, /пятниц|(^|[^а-яё])пт([^а-яё]|$)/, /суббот|(^|[^а-яё])сб([^а-яё]|$)/, /воскресен|(^|[^а-яё])вс([^а-яё]|$)/];
const weekday = (d) => (new Date((d || dateStr()) + 'T12:00').getDay() + 6) % 7;
// «Каждый вторник и четверг» → дни 1 и 3; «Работает всегда» — бот, не задача; «во время теста — …» — пояснение, не расписание
function whenPlan(text) {
  const p = { days: [], flex: 0, every: 0, always: false };
  String(text || '').toLowerCase().split(/[.;]/).filter((x) => x.trim() && !/во время/.test(x)).forEach((x) => {
    if (/всегда|круглосуточно/.test(x)) p.always = true;
    if (/каждый день|ежедневно|каждое утро|каждый вечер/.test(x)) p.days = [0, 1, 2, 3, 4, 5, 6];
    if (/по будням|в будни/.test(x)) p.days = p.days.concat([0, 1, 2, 3, 4]);
    WD_RX.forEach((rx, i) => { if (rx.test(x)) p.days.push(i); });
    const n = x.match(/(\d+)\s*раза?\s+в\s+неделю/);
    if (n && !WD_RX.some((rx) => rx.test(x))) p.flex = Number(n[1]);
    else if (/раз в неделю|еженедельно|каждую неделю/.test(x) && !WD_RX.some((rx) => rx.test(x))) p.days.push(0);
    if (/раз в 2 недели|раз в две недели/.test(x)) p.every = 14;
    if (/раз в месяц|ежемесячно/.test(x)) p.every = 30;
  });
  p.days = Array.from(new Set(p.days)).sort();
  p.event = !p.days.length && !p.flex && !p.every && !p.always;
  return p;
}
const runsOf = (id) => (S.runs && S.runs[id]) || [];
const ranToday = (id) => runsOf(id).indexOf(dateStr()) >= 0;
const runsThisWeek = (id) => runsOf(id).filter((d) => isoWeek(d) === isoWeek(dateStr())).length;
const daysSinceRun = (id) => { const r = runsOf(id); return r.length ? daysBetween(r[r.length - 1], dateStr()) : Infinity; };
function officeWeek() {
  const today = weekday(), w = { days: WD.map(() => []), flex: [], every: [], event: [], always: [], today: [], may: [] };
  STEPS.filter((s) => s.agent && isDone(s.id)).forEach((s) => {
    const p = whenPlan(regOf(s.id).when);
    p.days.forEach((d) => w.days[d].push(s));
    if (p.flex) w.flex.push([s, p.flex]);
    if (p.every) w.every.push([s, p.every]);
    if (p.always) w.always.push(s);
    if (p.event) w.event.push(s);
    if (p.days.indexOf(today) >= 0) w.today.push(s);
    else if ((p.flex || p.every) && (ranToday(s.id) || (p.flex && runsThisWeek(s.id) < p.flex) || (p.every && daysSinceRun(s.id) >= p.every))) w.may.push(s);
  });
  return w;
}
function markRun(id) {
  S.runs = S.runs || {};
  const t = dateStr(), r = runsOf(id).filter((d) => d !== t);
  S.runs[id] = ranToday(id) ? r : r.concat(t).slice(-12);
  touch(); save();
}
function agentPath(s) { return 'agents/' + (A.deptFolder[s.room] || s.room) + '/' + s.agent + '.md'; }
function qaBlock(s) { const a = answersOf(s.id); return s.questions.map((q) => '### ' + plain(q.label) + '\n\n' + (String(a[q.id] || '').trim() || '— (ответ появится позже)')).join('\n\n'); }
function giftLine(g) {
  if (g.type === 'skill') return '- Скилл `' + g.name + '` — ' + plain(g.what);
  if (g.type === 'connector') return '- Коннектор ' + g.name + ' — ' + plain(g.what);
  if (g.type === 'template') return '- Шаблон «' + g.title + '» — ' + plain(g.what);
  return '- ' + (g.type === 'artifact' ? 'Артефакт' : 'Продукт') + ' «' + g.title + '» — ' + plain(g.what) + (g.url ? ' ' + g.url : '');
}
function regTable(id) {
  const r = regOf(id);
  return '| Пункт | Как у нас |\n|---|---|\n| Когда запускать | ' + (r.when || '—') + ' |\n| На входе | ' + (r.input || '—') + ' |\n| На выходе | ' + (r.output || '—') + ' |\n| Ответственный | ' + (r.owner || '—') + ' |\n| Проверка | ' + (r.check || '—') + ' |\n| Инструменты | ' + ((r.tools || []).join(', ') || '—') + ' |';
}
function agentFile(s) {
  const x = S.steps[s.id] || {};
  return '# Агент «' + s.title + '» — ' + brand() + '\n\n' +
    'Отдел: ' + roomName(s.room) + ' · руководитель: ' + headOf(s.room) + (x.hiredAt ? ' · нанят ' + when(x.hiredAt) : '') + '\n\n' +
    '## Что делает\n\n' + plain(s.brief) + '\n\n' +
    '## Контекст\n\n' + qaBlock(s) + '\n\n' +
    '## Инструменты\n\n' + s.gifts.map(giftLine).join('\n') + '\n\n' +
    '## Как запустить\n\nСкопируй промпт в проект Claude:\n\n```\n' + fill(s.task.prompt, x.answers) + '\n```\n\n' +
    '## Регламент\n\n' + regTable(s.id) + '\n\n' +
    '## Первый результат\n\n' + (String(x.result || '').trim() || '— (ещё нет)') + '\n';
}
function contextFile(s) {
  const title = { 'context/business.md': 'Паспорт бизнеса', 'context/tools.md': 'Сервисы и подключения', 'context/market.md': 'Рынок и конкуренты', 'context/offer.md': 'Продукты и оффер', 'context/audience.md': 'Аудитория' }[s.context] || s.title;
  return '# ' + title + ' — ' + brand() + '\n\n' + qaBlock(s) + '\n';
}
function claudeMd() {
  const b = answersOf('0.1');
  const rooms = ['ceo', 'marketing', 'sales', 'traffic'];
  const hired = STEPS.filter((s) => s.agent && isDone(s.id));
  return '# Инструкция для Claude — ' + brand() + '\n\n' +
    'Меня зовут ' + myName() + '. ' + (S.profile && S.profile.niche ? 'Мой бизнес: ' + S.profile.niche + '. ' : '') + 'Ты — мой ИИ-офис: команда агентов, у каждого своя задача, скилл и регламент.\n\n' +
    '## Как со мной работать\n\n- Пиши на «ты», коротко и по делу.\n- Факты, цены и цифры бери только из файлов проекта. Чего нет — спроси меня.\n- Перед ответом проверь: это про мой бизнес или «в общем»?\n- Если задача подходит агенту — работай по его файлу в agents/ и его регламенту.\n\n' +
    '## Мой бизнес\n\n' + (b.products ? '- Что продаю: ' + String(b.products).replace(/\n/g, '; ') + '\n' : '') + (b.clients ? '- Клиенты: ' + String(b.clients).replace(/\n/g, '; ') + '\n' : '') + (b.team ? '- Команда: ' + String(b.team).replace(/\n/g, '; ') + '\n' : '') + '\nПодробно — в context/business.md.\n\n' +
    '## Отделы и агенты\n\n' + rooms.map((r) => {
      const ag = hired.filter((s) => s.room === r);
      return '- ' + roomName(r) + ' — руководитель ' + headOf(r) + (ag.length ? ': ' + ag.map((s) => '«' + s.title + '» (' + agentPath(s) + ')').join(', ') : ': агентов пока нет');
    }).join('\n') + '\n\n' +
    '## Файлы проекта\n\n' + projectFiles().filter((f) => f.path !== 'CLAUDE.md').map((f) => '- ' + f.path + ' — ' + f.about).join('\n') + '\n';
}
function teamFile() {
  const hired = STEPS.filter((s) => s.agent && isDone(s.id));
  return '# Команда и регламенты — ' + brand() + '\n\n## Люди\n\n' + (team().length ? team().map((t) => '- ' + t).join('\n') : '- ' + myName() + ' — всё сам') + '\n\n' +
    '## Руководители отделов\n\n' + ['ceo', 'marketing', 'sales', 'traffic'].map((r) => '- ' + roomName(r) + ' — ' + headOf(r)).join('\n') + '\n\n' +
    '## Агенты\n\n| Отдел | Агент | Когда | Ответственный | Проверка |\n|---|---|---|---|---|\n' +
    hired.map((s) => { const r = regOf(s.id); return '| ' + roomName(s.room) + ' | ' + s.title + ' | ' + (r.when || '—') + ' | ' + (r.owner || '—') + ' | ' + (r.check || '—') + ' |'; }).join('\n') + '\n';
}
function ownSkill() {
  const s = STEPS.find((x) => x.ownSkill);
  if (!s || !isDone(s.id)) return null;
  const a = answersOf(s.id);
  const title = String(a.skill_name || 'Мой скилл').trim().split('\n')[0];
  const lines = (t) => String(t || '').split('\n').map((x) => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
  return { id: slug(title, 'my-skill'), title: title, when: lines(a.skill_when).join('; ') || title, steps: lines(a.skill_steps), check: lines(a.skill_check) };
}
function skillMd(k) {
  return '---\nname: ' + k.id + '\ndescription: ' + JSON.stringify(k.title + ' для «' + brand() + '». Используй, когда нужно: ' + k.when + '.') + '\n---\n\n# ' + k.title + '\n\n' +
    'Работай только с фактами из файлов проекта. Если данных не хватает — спроси.\n\n## Как работать\n\n' + (k.steps.length ? k.steps.map((x, i) => (i + 1) + '. ' + x).join('\n') : '1. Сделай задачу по шагам.') + '\n\n' +
    '## Проверь перед ответом\n\n' + (k.check.length ? k.check.map((x) => '- ' + x).join('\n') : '- Ничего не придумано.\n- Результат готов к использованию.') + '\n';
}
function projectFiles() {
  const out = [];
  if (!S.profile) return out;
  out.push({ path: 'CLAUDE.md', about: 'инструкция для Claude: кто ты, отделы, агенты', text: claudeMd });
  STEPS.forEach((s) => { if (s.context && (isDone(s.id) || (S.steps[s.id] && S.steps[s.id].answered))) out.push({ path: s.context, about: plain(s.title).toLowerCase(), text: () => contextFile(s) }); });
  STEPS.forEach((s) => { if (s.agent && isDone(s.id)) out.push({ path: agentPath(s), about: 'агент «' + s.title + '»: контекст, промпт, регламент', text: () => agentFile(s) }); });
  if (hiredSet().size) out.push({ path: 'regulations/team.md', about: 'люди, руководители, регламенты агентов', text: teamFile });
  const fin = STEPS.find((x) => x.ownSkill);
  if (fin && isDone(fin.id)) out.push({ path: 'regulations/office-week.md', about: 'неделя офиса по дням', text: () => '# Неделя офиса — ' + brand() + '\n\n' + (String(answersOf(fin.id).week_plan || '').trim() || '—') + '\n' });
  const o = ownSkill();
  if (o) out.push({ path: 'skills/' + o.id + '/SKILL.md', about: 'твой первый скилл', text: () => skillMd(o) });
  return out;
}

// ---------- AI ----------
const aiOn = () => !!(RT.sample && RT.ai);
function aiError(e) {
  const c = e && e.code;
  if (c === 'cancelled') return '';
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(c)) { RT.ai = false; return 'ИИ выключен в этом окне. Проверим по простым правилам.'; }
  if (c === 'rate_limited') return 'Слишком много запросов к ИИ. Подожди минуту и нажми ещё раз.';
  if (c === 'invalid_json') return 'ИИ ответил непонятно. Нажми ещё раз.';
  if (c === 'refused' || c === 'empty_completion') return 'ИИ не смог ответить на этот текст. Попробуй переформулировать.';
  return 'Связь с ИИ прервалась. Нажми ещё раз.';
}
function bizContext(limit) {
  const parts = [];
  ['0.1', '1.3', '2.1'].forEach((id) => { if (S.steps[id] && S.steps[id].answered) parts.push(qaBlock(STEP[id])); });
  const s = parts.join('\n\n');
  return s.length > limit ? s.slice(0, limit) + '\n…' : s;
}
async function aiSuggest(step, q, draft) {
  const p = 'Помоги ученику ответить на вопрос про его бизнес. Шаг: найм агента «' + step.title + '» в ИИ-офис.\nВопрос: «' + plain(q.label) + '». Подсказка: ' + plain(q.hint) + '\n' +
    'Проект ученика: «' + brand() + '»' + (S.profile && S.profile.niche ? ' — ' + S.profile.niche : '') + '.\n' + (bizContext(1800) ? 'Что ученик уже рассказал:\n' + bizContext(1800) + '\n' : '') +
    'Черновик ученика: ' + (draft.trim() || '(пусто)') + '\nКак это заполнено у AICEX (только для формы, факты не копируй): ' + plain(q.example) + '\n\n' +
    'Дай 3 разных варианта ответа от лица ученика: конкретно, коротко, простыми словами. Чего не знаешь — оставь пропуск [вставь]. Верни только JSON-массив из 3 строк.';
  const r = await RT.sample.json(p, { modelTier: 'quick', cache: false });
  return (Array.isArray(r) ? r : []).map(String).filter(Boolean).slice(0, 3);
}
async function aiCheck(step, result) {
  const p = 'Ты проверяешь задание в треке «Свой ИИ-офис». Ученик нанимает агента «' + step.title + '»: запустил готовое решение в своём проекте Claude и прислал результат.\n' +
    'Задание: ' + plain(step.task.title) + '\nЧто должен прислать: ' + plain(step.task.result) + '\n\nОтветы ученика про бизнес:\n' + qaBlock(step) + '\n\nРезультат ученика:\n' + String(result).slice(0, 6000) + '\n\n' +
    'Критерии:\n' + step.task.check.map((c, i) => (i + 1) + '. ' + c).join('\n') + '\n\n' +
    'Проверяй по смыслу, а не по стилю. Если прислана ссылка — считай, что по ней лежит результат, и оцени описание рядом. Пиши по-русски, на «ты», очень просто.\n' +
    'Верни только JSON: {"criteria":[{"ok":true,"note":"коротко"},{"ok":true,"note":"…"},{"ok":false,"note":"…"}],"verdict":"accepted","praise":"одна фраза","fixes":["что поправить"]}\n' +
    'verdict: "accepted" — все 3 выполнены; "accepted_with_tips" — 2 из 3 и результат рабочий; "revise" — иначе.';
  const r = await RT.sample.json(p, { modelTier: 'quick' });
  const crit = (Array.isArray(r && r.criteria) ? r.criteria : []).slice(0, 3);
  while (crit.length < 3) crit.push({ ok: true, note: '' });
  const okN = crit.filter((c) => c && c.ok).length;
  const v = ['accepted', 'accepted_with_tips', 'revise'].includes(r && r.verdict) ? r.verdict : okN === 3 ? 'accepted' : okN === 2 ? 'accepted_with_tips' : 'revise';
  return { verdict: v, by: 'ai', criteria: crit.map((c) => ({ ok: !!(c && c.ok), note: String((c && c.note) || '') })), praise: String((r && r.praise) || ''), fixes: (Array.isArray(r && r.fixes) ? r.fixes : []).map(String).slice(0, 4) };
}
function localCheck(step, result) {
  const r = String(result || '').trim();
  const ok = step.task.resultType === 'link' ? isUrl(r.split(/\s/)[0]) || isUrl(r) : r.length >= 40;
  return { verdict: ok ? 'accepted' : 'revise', by: 'local', criteria: step.task.check.map(() => ({ ok: ok, note: '' })), praise: ok ? 'Результат на месте. Без ИИ проверяем только, что он есть.' : '',
    fixes: ok ? [] : [step.task.resultType === 'link' ? 'Вставь ссылку на результат: она начинается с https://' : 'Вставь сам результат из Claude — сейчас слишком коротко.'] };
}

// ---------- Downloads, clipboard, toast, modal ----------
// на своём сайте (вне claude.ai) — обычное скачивание браузера
function browserSave(o) {
  const blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return Promise.resolve();
}
async function offerFile(filename, data) {
  if (!RT.downloads) { toast('Скачивание работает, когда офис открыт в claude.ai. Пока можно скопировать текст.'); return false; }
  try { await RT.downloads.save({ filename: filename, data: data }); return true; }
  catch (e) { const c = e && e.code; if (c !== 'declined') toast(c === 'rate_limited' ? 'Окно сохранения уже открыто.' : 'Скачать не получилось. Попробуй ещё раз.'); return false; }
}
async function zipProject() {
  if (!window.JSZip) { toast('Архиватор не загрузился. Обнови страницу.'); return; }
  const z = new window.JSZip();
  projectFiles().forEach((f) => z.file(f.path, f.text()));
  await offerFile(slug(brand(), 'office') + '-ai-office.zip', await z.generateAsync({ type: 'blob' }));
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); }
  catch (e) {
    openModal('<div class="adh"><b class="h2">Скопируй текст</b><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div><p class="mut sm">Браузер не дал скопировать сам. Текст выделен — нажми Ctrl+C или Cmd+C.</p><textarea class="ta" id="copy-area" rows="12" readonly>' + esc(text) + '</textarea>');
    const t = $('#copy-area'); if (t) { t.focus(); t.select(); }
  }
}
function toast(msg, kind) {
  if (!msg) return;
  const w = $('#aToasts'); if (!w) return;
  const t = document.createElement('div');
  t.className = 'atoast ' + (kind || ''); t.textContent = msg; w.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3400); setTimeout(() => t.remove(), 4000);
}
let modalBack = null;
function openModal(html, wide) {
  const m = $('#aModal');
  modalBack = document.activeElement;
  m.innerHTML = '<div class="adlg glass' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  m.hidden = false;
  const f = m.querySelector('input, textarea, button'); if (f) f.focus({ preventScroll: true });
}
function closeModal() { const m = $('#aModal'); if (m && !m.hidden) { m.hidden = true; m.innerHTML = ''; if (modalBack && modalBack.focus) modalBack.focus({ preventScroll: true }); } }
function showTerm(el) {
  hidePop();
  const k = el.getAttribute('data-term'), d = A.glossary[k]; if (!d) return;
  const p = document.createElement('div'); p.className = 'pop'; p.id = 'aPop'; p.innerHTML = '<b>' + esc(k) + '</b>' + esc(d);
  document.body.appendChild(p);
  const r = el.getBoundingClientRect();
  p.style.left = Math.min(Math.max(12, r.left + r.width / 2 - p.offsetWidth / 2), innerWidth - p.offsetWidth - 12) + 'px';
  p.style.top = (r.top - p.offsetHeight - 8 < 12 ? r.bottom + 8 : r.top - p.offsetHeight - 8) + 'px';
}
function hidePop() { const p = $('#aPop'); if (p) p.remove(); }
