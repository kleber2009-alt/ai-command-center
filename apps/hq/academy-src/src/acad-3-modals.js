// ---------- Onboarding ----------
function showOnboarding() {
  const o = UI.onb || {}, nm = o.name != null ? o.name : RT.me && RT.me.name ? RT.me.name.split(' ')[0] : '';
  openModal('<div class="onb"><div class="stk" style="gap:14px"><span class="eb">Академия AICEX · трек «Свой ИИ-офис»</span>' +
    '<h1>Это твой офис.<br><em>Пока он пустой.</em></h1>' +
    '<p class="mut" style="margin:0;font-size:14.5px;line-height:1.55">Модули — это комнаты. Пустой стол с мигающей меткой — твой следующий шаг. На каждом шаге ты нанимаешь одного ИИ-агента: отвечаешь на вопросы про свой бизнес, получаешь готовое решение AICEX и запускаешь его в своём проекте Claude.</p>' +
    '<div class="how"><div><b>26 шагов</b><span class="mut">7 модулей-комнат</span></div><div><b>24 агента</b><span class="mut">4 отдела</span></div><div><b>Готовые решения</b><span class="mut">скиллы, артефакты, шаблоны</span></div></div>' +
    '<p class="mut sm" style="margin:0">В конце у тебя рабочий бизнес: агенты, команда, регламенты и проект Claude, который знает твоё дело.</p>' +
    '<div class="stk" style="gap:4px"><span class="eb">Что понадобится · весь трек ≈ ' + hours(trackHours()) + '</span>' + needsHTML(A.needs.start, true) + '<button class="lnk sm" type="button" data-act="needs" data-id="">Подробнее и что нужно в каждом модуле</button></div></div>' +
    '<form class="stk" id="aOnb" autocomplete="off"><div class="reg"><label for="aon-name">Как тебя зовут?</label><input class="in" id="aon-name" value="' + esc(nm) + '" placeholder="Например, Анна"></div>' +
    '<div class="reg"><label for="aon-project">Как называется твой бизнес или проект?</label><input class="in" id="aon-project" value="' + esc(o.project || '') + '" placeholder="Например, Школа английского «Speak»"></div>' +
    '<div class="reg"><label for="aon-goal">Что хочешь получить первым?</label><select class="sel" id="aon-goal">' + A.goals.map((g) => '<option value="' + g.id + '"' + (g.id === (o.goal || 'leads') ? ' selected' : '') + '>' + esc(g.title) + '</option>').join('') + '</select></div>' +
    '<div class="reg"><label for="aon-niche">Чем занимаешься — одной фразой?</label><input class="in" id="aon-niche" value="' + esc(o.niche || '') + '" placeholder="Например, учу взрослых говорить по-английски за 3 месяца"></div>' +
    '<button class="ab pri full" type="submit">Войти в свой офис ' + icon('right') + '</button>' +
    '<button class="ab full" type="button" data-act="demo">' + icon('eye') + 'Посмотреть пример: офис AICEX на середине трека</button>' +
    '<a class="ab ghost full" href="' + A.officeUrl + '" target="_blank" rel="noopener">Как выглядит готовый офис AICEX ' + icon('ext', 13) + '</a>' +
    '<button class="lnk sm" type="button" data-act="transfer" style="justify-self:center">Уже начал трек на другом устройстве? Загрузить прогресс</button></form></div>', true);
}
function startProject() {
  const name = $('#aon-name').value.trim(), project = $('#aon-project').value.trim(), niche = $('#aon-niche').value.trim();
  if (!name || !project) { toast('Напиши имя и название проекта.'); (!name ? $('#aon-name') : $('#aon-project')).focus(); return; }
  S = fresh();
  S.profile = { name: name, project: project, niche: niche, goal: ($('#aon-goal') || {}).value || 'leads', started: Date.now() };
  UI.onb = null;
  touch(); save(); closeModal();
  renderAll();
  if (window.OFFICE) window.OFFICE.sync();
  setTimeout(() => openStep('0.1'), 300);
}

// ---------- Что понадобится ----------
function showNeeds(mid) {
  const one = mid != null && mid !== '' && MOD[mid], back = S.profile || MODE === 'demo' ? 'close' : 'onb';
  if ($('#aOnb')) UI.onb = { name: $('#aon-name').value, project: $('#aon-project').value, niche: $('#aon-niche').value, goal: $('#aon-goal').value };
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">' + (one ? 'Модуль ' + one.id + ' · ' + esc(one.title) + ' · ≈ ' + hours(modMinutes(one.id)) : 'Весь трек · ≈ ' + hours(trackHours())) + '</span><b class="h2">Что понадобится</b></div><button class="icob" data-act="' + back + '" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    (one ? '' : '<div class="stk"><span class="eb">До старта</span>' + needsHTML(A.needs.start) + '</div>') +
    (one ? [one] : A.modules).map((m) => '<div class="stk">' + (one ? '' : '<span class="eb">Модуль ' + m.id + ' · ' + esc(m.title) + ' · ≈ ' + hours(modMinutes(m.id)) + '</span>') + needsHTML(A.needs.modules[m.id] || []) + '</div>').join('') +
    '<div class="row">' + (one ? '<button class="ab sm" data-act="needs" data-id="">Весь трек</button>' : '') + (back === 'onb' ? '<button class="ab pri sm" data-act="onb">' + icon('left', 13) + 'Назад к старту</button>' : '') + '</div>', true);
}

// ---------- Сегодня и неделя офиса ----------
function runCard(s, note) {
  const r = regOf(s.id), done = ranToday(s.id);
  return '<div class="gift run' + (done ? ' done' : '') + '"><span class="gi skill">' + icon(done ? 'check' : 'user', 18) + '</span><div><span class="k">' + esc(roomName(s.room)) + (r.owner ? ' · отвечает ' + esc(r.owner) : '') + '</span><b>' + esc(s.title) + '</b>' +
    '<p>' + esc(note || r.when || '') + '</p><div class="row"><button class="ab sm' + (done ? '' : ' pri') + '" data-act="copy-prompt" data-id="' + s.id + '">' + icon('copy', 13) + 'Промпт запуска</button>' +
    '<button class="ab sm" data-act="run-done" data-id="' + s.id + '">' + icon('check', 13) + (done ? 'Сделано сегодня' : 'Отметить: сделано') + '</button>' +
    '<button class="ab ghost sm" data-act="agent" data-id="' + s.agent + '">Регламент</button></div></div></div>';
}
function showToday() {
  const w = officeWeek(), d = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Сегодня · ' + esc(d) + '</span><b class="h2">Кого запустить сегодня</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<p class="mut sm" style="margin:0">Расписание взято из регламентов: поле «Когда запускать». Открой проект в Claude, вставь промпт агента и отметь, что сделано.</p>' +
    (w.today.length ? '<div class="stk"><span class="eb">По регламенту · ' + w.today.length + '</span>' + w.today.map((s) => runCard(s)).join('') + '</div>' : '<div class="box"><span class="sm">Сегодня по регламенту никого. Хороший день, чтобы нанять следующего агента.</span></div>') +
    (w.may.length ? '<div class="stk"><span class="eb">Можно сегодня</span>' + w.may.map((s) => runCard(s, whenNote(s))).join('') + '</div>' : '') +
    (w.always.length ? '<div class="stk"><span class="eb">Работают сами</span><div class="row">' + w.always.map((s) => '<span class="pill ok">' + icon('check', 11) + esc(s.title) + '</span>').join('') + '</div><span class="mut sm">Боты и автоответы. Раз в неделю загляни в их отчёты.</span></div>' : '') +
    '<div class="row"><button class="ab sm" data-act="week">' + icon('track', 13) + 'Вся неделя офиса</button></div>', true);
}
function whenNote(s) {
  const p = whenPlan(regOf(s.id).when);
  if (p.flex) return p.flex + ' ' + plural(p.flex, 'раз', 'раза', 'раз') + ' в неделю · на этой неделе ' + runsThisWeek(s.id);
  const last = daysSinceRun(s.id);
  return (p.every === 14 ? 'Раз в 2 недели' : 'Раз в месяц') + ' · ' + (last === Infinity ? 'ещё не запускали' : last === 0 ? 'запускали сегодня' : 'последний раз ' + last + ' ' + plural(last, 'день', 'дня', 'дней') + ' назад');
}
function showWeek() {
  const w = officeWeek(), t = weekday(), chip = (s) => '<button class="pill chip' + (ranToday(s.id) ? ' ok' : '') + '" data-act="agent" data-id="' + s.agent + '">' + esc(s.title) + '</button>';
  const list = (title, items) => items.length ? '<div class="stk"><span class="eb">' + title + '</span><div class="row">' + items.map(chip).join('') + '</div></div>' : '';
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Неделя офиса · ' + hiredSet().size + ' ' + plural(hiredSet().size, 'агент', 'агента', 'агентов') + '</span><b class="h2">Кто и когда работает</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="wk">' + WD.map((name, i) => '<div class="wkd' + (i === t ? ' on' : '') + '"><b>' + name.slice(0, 1).toUpperCase() + name.slice(1) + '</b>' + (w.days[i].length ? w.days[i].map(chip).join('') : '<span class="mut sm">—</span>') + '</div>').join('') + '</div>' +
    list('Несколько раз в неделю — в любой день', w.flex.map((x) => x[0])) + list('Раз в 2 недели или раз в месяц', w.every.map((x) => x[0])) +
    list('По событию: новый продукт, рилс, эфир', w.event) + list('Работают сами', w.always) +
    '<p class="mut sm" style="margin:0">Чтобы поменять день, открой агента и поправь «Когда запускать» в регламенте.</p>' +
    '<div class="row"><button class="ab pri sm" data-act="today">' + icon('clock', 13) + 'Что сегодня</button></div>', true);
}

// ---------- Цель ----------
function showGoal() {
  const cur = (S.profile && S.profile.goal) || 'leads';
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Твой маршрут</span><b class="h2">Что хочешь получить первым?</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<p class="mut sm" style="margin:0">Трек тот же, меняется ориентир: сколько шагов до результата и какие из них главные.</p>' +
    '<div class="lib">' + A.goals.map((g) => '<button class="box' + (g.id === cur ? ' amber' : '') + '" style="text-align:left" data-act="goal-set" data-id="' + g.id + '"><b>' + esc(g.title) + '</b><span class="mut sm">' + esc(g.what) + '</span><span class="pill">' + icon('track', 12) + 'Цель — шаг ' + g.milestone + ' «' + esc(STEP[g.milestone].title) + '»</span></button>').join('') + '</div>', true);
}
function setGoal(id) {
  if (!S.profile || !A.goals.some((g) => g.id === id)) return;
  S.profile.goal = id; save(); closeModal(); renderPanel();
  toast('Цель: ' + myGoal().title);
}

// ---------- Перенос прогресса: сайт ↔ claude.ai ↔ другое устройство ----------
const PROG = 'aicex-academy';
const doneIn = (s) => STEPS.filter((x) => s.steps[x.id] && s.steps[x.id].hired).length;
function showTransfer() {
  const has = !!S.profile, back = has ? 'close' : 'onb';
  if ($('#aOnb')) UI.onb = { name: $('#aon-name').value, project: $('#aon-project').value, niche: $('#aon-niche').value, goal: $('#aon-goal').value };
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Перенос прогресса</span><b class="h2">Продолжить в другом месте</b></div><button class="icob" data-act="' + back + '" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<p class="mut sm" style="margin:0">Прогресс хранится там, где ты проходишь трек: на сайте — в этом браузере, в claude.ai — в облаке. Чтобы продолжить на другом устройстве или в claude.ai, забери его здесь и загрузи там.</p>' +
    (has ? '<div class="box"><b>1. Забрать отсюда</b><span class="mut sm">' + esc(brand()) + ': ' + doneCount() + ' из ' + STEPS.length + ' шагов, ' + fmt(S.xp) + ' опыта. Файл можно отправить себе в Telegram или на почту.</span>' +
      '<div class="row"><button class="ab pri sm" data-act="prog-file">' + icon('download', 13) + 'Скачать файл прогресса</button><button class="ab sm" data-act="prog-copy">' + icon('copy', 13) + 'Скопировать текстом</button></div></div>' : '') +
    '<div class="box"><b>' + (has ? '2. ' : '') + 'Загрузить сюда</b><span class="mut sm">Выбери файл прогресса или вставь его текст.</span>' +
    '<div class="row"><label class="ab sm pri" for="aprog-file" tabindex="0">' + icon('file', 13) + 'Выбрать файл</label><input type="file" id="aprog-file" accept=".json,application/json" hidden></div>' +
    '<textarea class="ta" id="aprog-text" rows="3" placeholder="Или вставь сюда текст прогресса"></textarea>' +
    '<div class="row"><button class="ab sm" data-act="prog-load">' + icon('check', 13) + 'Проверить текст и загрузить</button></div></div>', true);
}
function progressText() {
  return JSON.stringify({ app: PROG, kind: 'progress', v: 2, exported: new Date().toISOString(), from: MODE === 'cloud' ? 'claude.ai' : 'site', state: clone(S) });
}
async function exportProgress(asText) {
  if (asText) return copyText(progressText());
  const name = slug(brand(), 'office') + '-progress-' + dateStr() + '.json';
  if (await offerFile(name, new Blob([progressText()], { type: 'application/json;charset=utf-8' }))) toast('Файл прогресса сохранён');
}
function parseProgress(text) {
  let o = null;
  try { o = JSON.parse(String(text || '').trim()); } catch (e) { return null; }
  const s = o && o.app === PROG ? o.state : o;
  if (!s || typeof s !== 'object' || s.v !== 2 || !s.profile || !s.profile.project || !s.steps || typeof s.steps !== 'object') return null;
  const n = Object.assign(fresh(), clone(s));
  n.xp = Number(n.xp) || 0;
  if (!Array.isArray(n.badges)) n.badges = [];
  if (!n.streak || typeof n.streak !== 'object') n.streak = fresh().streak;
  return { state: n, at: o && o.exported ? Date.parse(o.exported) : null };
}
function importProgress(text) {
  const p = parseProgress(text);
  if (!p) { toast('Это не файл прогресса академии. Скачай его заново на устройстве, где проходишь трек.'); return; }
  UI.imp = p.state;
  const n = p.state;
  openModal('<div class="adh"><b class="h2">Загрузить прогресс?</b><button class="icob" data-act="transfer" aria-label="Назад">' + icon('x') + '</button></div>' +
    '<div class="box"><b>Офис: ' + esc(n.profile.project) + '</b><span class="sm">' + doneIn(n) + ' из ' + STEPS.length + ' шагов · ' + fmt(n.xp) + ' опыта' + (p.at ? ' · сохранён ' + ago(p.at) : '') + '</span></div>' +
    (S.profile ? '<p class="mut sm" style="margin:0">Прогресс здесь (' + esc(brand()) + ', ' + doneCount() + ' из ' + STEPS.length + ' шагов) заменится. Если он нужен — сначала скачай его файлом.</p>' : '') +
    '<div class="row"><button class="ab pri" data-act="prog-ok">' + icon('check') + 'Загрузить</button><button class="ab ghost" data-act="transfer">Назад</button></div>');
}
function applyProgress() {
  if (!UI.imp) return;
  S = UI.imp; UI.imp = null; UI.onb = null;
  UI.view = 'track'; UI.step = null; UI.stage = {};
  save(); closeModal(); renderAll();
  if (window.OFFICE) window.OFFICE.sync();
  toast('Прогресс загружен: ' + doneCount() + ' из ' + STEPS.length + ' шагов', 'hire');
}

// ---------- Project ----------
function showProject(path) {
  const files = projectFiles();
  if (!files.length) { toast('Файлы появятся после первого шага.'); return; }
  const cur = files.find((f) => f.path === path) || files[0];
  UI.file = cur.path;
  const tree = files.map((f) => '<button class="frow" data-act="file" data-path="' + esc(f.path) + '" aria-pressed="' + (f.path === cur.path) + '"><span><b>' + esc(f.path) + '</b><small>' + esc(f.about) + '</small></span></button>').join('');
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Проект · ' + files.length + ' ' + plural(files.length, 'файл', 'файла', 'файлов') + '</span><b class="h2">' + esc(brand()) + '</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="row"><button class="ab pri sm" data-act="zip"' + (RT.downloads ? '' : ' disabled') + '>' + icon('download', 13) + 'Скачать всё (.zip)</button><button class="ab sm" data-act="guide" data-id="claude-knowledge">' + icon('pointer', 13) + 'Как загрузить в Claude</button>' +
    (RT.downloads ? '' : '<span class="mut sm">Скачивание работает, когда офис открыт в claude.ai.</span>') + '</div>' +
    '<div class="split"><div class="files">' + tree + '</div><div class="stk"><div class="spr"><b class="mono">' + esc(cur.path) + '</b><div class="row"><button class="ab sm" data-act="copy-file" data-path="' + esc(cur.path) + '">' + icon('copy', 13) + 'Скопировать</button>' +
    '<button class="ab sm" data-act="dl-file" data-path="' + esc(cur.path) + '"' + (RT.downloads ? '' : ' disabled') + '>' + icon('download', 13) + '.md</button></div></div><article class="doc">' + md(cur.text()) + '</article></div></div>', true);
}
const fileByPath = (p) => projectFiles().find((f) => f.path === p);

// ---------- Library of ready solutions ----------
function showLibrary() {
  const got = [];
  STEPS.forEach((s) => { if (st(s.id).giftsTaken) s.gifts.forEach((g, i) => got.push([s, g, i])); });
  const groups = ['skill', 'artifact', 'product', 'connector', 'template'];
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Готовые решения AICEX</span><b class="h2">' + got.length + ' ' + plural(got.length, 'решение', 'решения', 'решений') + ' у тебя</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="spr"><span class="mut sm">' + (myCode() ? 'Код ученика: ' + esc(myCode()) : 'Скиллы AICEX скачиваются по коду ученика.') + '</span><button class="ab ghost sm" data-act="skill-code" data-skill="">' + (myCode() ? 'Сменить код' : 'Ввести код') + '</button></div>' +
    (got.length ? groups.map((g) => { const items = got.filter((x) => x[1].type === g); return items.length ? '<div class="stk"><span class="eb">' + GIFT_KIND[g] + ' · ' + items.length + '</span><div class="lib">' + items.map((x) => giftHTML(x[1], x[0].id, x[2])).join('') + '</div></div>' : ''; }).join('')
      : '<p class="mut">Решения появляются, когда ты забираешь их в шаге. Первые — уже на ресепшне.</p>'), true);
}
// код ученика: им открываются архивы скиллов AICEX на сайте академии
function showCode(skill) {
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Скиллы AICEX</span><b class="h2">Код ученика</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<p class="mut sm" style="margin:0">Скиллы AICEX скачиваются по коду ученика. Код приходит после оплаты академии — в письме или в чате потока. Он выглядит так: anna-7KQ2MX.</p>' +
    '<form id="aCode" class="stk" data-skill="' + esc(skill || '') + '"><div class="reg"><label for="acode">Твой код</label><input class="in" id="acode" autocomplete="off" spellcheck="false" placeholder="имя-XXXXXX" value="' + esc(myCode()) + '"></div>' +
    '<button class="ab pri" type="submit">' + icon('download', 14) + (skill ? 'Сохранить и скачать' : 'Сохранить') + '</button></form>');
  setTimeout(() => { const f = $('#acode'); if (f) f.focus(); }, 50);
}
function saveCode(form) {
  const m = String($('#acode').value || '').trim().match(/^([a-z0-9]{2,24})-([a-z2-7]{6})$/i);
  if (!m) { toast('Код выглядит так: имя-XXXXXX. Проверь, нет ли лишних пробелов.'); return; }
  S.profile.code = m[1].toLowerCase() + '-' + m[2].toUpperCase();
  save(); closeModal(); renderPanel();
  const skill = form.getAttribute('data-skill');
  if (skill) window.open(skillHref(skill), '_blank', 'noopener');
  else toast('Код сохранён. Скиллы AICEX скачиваются на карточках.');
}
function showTemplate(sid, i) {
  const g = STEP[sid].gifts[i];
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Шаблон</span><b class="h2">' + esc(g.title) + '</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div><p class="mut sm" style="margin:0">' + esc(plain(g.what)) + '</p>' +
    '<div class="pre" style="max-height:52vh">' + esc(fill(g.text, answersOf(sid))) + '</div><div class="row"><button class="ab pri sm" data-act="copy-template" data-id="' + sid + '" data-i="' + i + '">' + icon('copy', 13) + 'Скопировать</button></div>');
}

// ---------- Team & regulations ----------
function showTeam() {
  const rooms = ['ceo', 'marketing', 'sales', 'traffic'];
  const opts = Array.from(new Set([myName()].concat(teamNames())));
  const hired = STEPS.filter((s) => s.agent && isDone(s.id));
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Команда и регламенты</span><b class="h2">Кто за что отвечает</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="stk"><span class="eb">Люди</span><div class="row">' + (team().length ? team().map((t) => '<span class="pill">' + esc(t) + '</span>').join('') : '<span class="mut sm">Пока только ты. Команду можно указать в шаге 0.1.</span>') + '</div></div>' +
    '<div class="stk"><span class="eb">Руководители отделов</span><div class="lib">' + rooms.map((r) => '<div class="reg"><label for="ahead-' + r + '">' + esc(roomName(r)) + (roomOpen(r) ? '' : ' · закрыт') + '</label><select class="sel" id="ahead-' + r + '" data-head="' + r + '">' +
      opts.map((o) => '<option' + (o === headOf(r) ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>').join('') + '</div><span class="mut sm">Имя руководителя появится над его столом в офисе.</span></div>' +
    '<div class="stk"><span class="eb">Агенты · ' + hired.length + ' из 24</span>' + (hired.length ? '<div class="tbl2"><table><thead><tr><th>Агент</th><th>Отдел</th><th>Когда</th><th>Отвечает</th></tr></thead><tbody>' +
      hired.map((s) => { const r = regOf(s.id); return '<tr><td><button class="ab ghost sm" data-act="agent" data-id="' + s.agent + '">' + esc(s.title) + '</button></td><td>' + esc(roomName(s.room)) + '</td><td>' + esc(r.when || '—') + '</td><td>' + esc(r.owner || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="mut sm" style="margin:0">Регламенты появятся, когда наймёшь первого агента.</p>') + '</div>', true);
}

// ---------- Agent card ----------
function showAgent(agentId) {
  const s = STEPS.find((x) => x.agent === agentId);
  if (!s) return;
  if (!isDone(s.id)) {
    openModal('<div class="adh"><b class="h2">«' + esc(s.title) + '»</b><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div><p class="mut" style="margin:0">Этот агент ещё не нанят. Его место — шаг ' + s.id + ' в модуле «' + esc(MOD[s.module].title) + '».</p>');
    return;
  }
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">' + esc(roomName(s.room)) + ' · руководитель ' + esc(headOf(s.room)) + '</span><b class="h2">Агент «' + esc(s.title) + '»</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="row"><button class="ab pri sm" data-act="copy-prompt" data-id="' + s.id + '">' + icon('copy', 13) + 'Скопировать промпт запуска</button><button class="ab sm" data-act="edit-reg" data-id="' + s.id + '">' + icon('template', 13) + 'Изменить регламент</button>' +
    '<button class="ab sm" data-act="dl-file" data-path="' + esc(agentPath(s)) + '"' + (RT.downloads ? '' : ' disabled') + '>' + icon('download', 13) + '.md</button></div>' +
    '<article class="doc">' + md(agentFile(s)) + '</article>', true);
}

// ---------- Boss ----------
function bossModal(id) {
  const s = STEP[id];
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">' + icon('crown', 12) + ' Босс шага ' + s.id + '</span><b class="h2">' + esc(s.boss.task) + '</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="reg"><label for="aboss">' + esc(s.boss.proof) + '</label><textarea class="ta" id="aboss" rows="4" placeholder="' + esc(s.boss.placeholder || '') + '"></textarea></div>' +
    '<div class="row"><button class="ab amber" data-act="boss-send" data-id="' + s.id + '">' + icon('check') + 'Победить босса</button><button class="ab ghost" data-act="close">Позже</button></div>');
}
function bossSend(id) {
  const v = (($('#aboss') || {}).value || '').trim();
  if (v.length < 4) { toast('Напиши доказательство: ссылку, цифру или пару строк.'); return; }
  const s = STEP[id], x = st(id), b = x.boss || (x.boss = {});
  if (b.status === 'done') return;
  b.status = 'done'; b.proof = v; b.at = Date.now();
  addXP(A.xp.boss, 'босс побеждён');
  if (A.bossBadge[id]) giveBadge(A.bossBadge[id]);
  touch(); save(); closeModal(); renderAll();
}

// ---------- Guides (schematic screens) ----------
const CUR = { t: null, n: 1 };
function E(id, cls, inner, style) {
  const on = !!id && id === CUR.t;
  return '<div class="' + cls + (on ? ' hot' : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' + inner + (on ? '<span class="hot-badge">' + CUR.n + '</span>' : '') + '</div>';
}
const who = () => esc(myName());
function cFrame(main, o) {
  o = o || {};
  const side = o.side || (E('nav-new', 'sc-item', '+ New chat') + E('nav-chats', 'sc-item', 'Chats') + E('nav-projects', 'sc-item' + (o.active ? ' strong' : ''), 'Projects') + E('nav-artifacts', 'sc-item', 'Artifacts') + '<div class="sc-item" style="font-size:9.5px;color:#8a94a8">Recents</div><div class="sc-line m"></div><div class="sc-line s"></div>');
  return '<div class="screen" role="img" aria-label="Схема экрана Claude"><div class="sc-bar"><i></i><i></i><i></i><span>' + (o.url || 'claude.ai') + '</span></div><div class="sc-body"><div class="sc-side">' + side + '</div>' + (o.noUser ? '' : E('nav-user', 'sc-foot', '<i></i><span>' + who() + '</span>')) + '<div class="sc-main">' + main + '</div></div></div>';
}
function oFrame(main) {
  return '<div class="screen" role="img" aria-label="Схема экрана офиса"><div class="sc-bar"><i></i><i></i><i></i><span>Академия AICEX · твой офис</span></div><div class="sc-body" style="grid-template-columns:1fr"><div class="sc-main">' + main + '</div></div></div>';
}
const projSide = () => '<div class="sc-title">' + esc(brand()) + '</div>' + E('chat-input', 'sc-input', 'How can I help you today?') + '<div class="sc-line m"></div><div class="sc-line s"></div>';
const SCREENS = {
  home: () => cFrame('<div class="sc-title" style="margin-top:14%;text-align:center">Good evening, ' + who() + '</div>' + E('input', 'sc-input', 'How can I help you today?')),
  projects: () => cFrame('<div class="spr"><div class="sc-title">Projects</div>' + E('btn-new', 'sc-btn dark', '+ New project') + '</div><div class="sc-row"><div class="sc-box"><b>Идеи</b><div class="sc-line m"></div></div><div class="sc-box"><b>Клиенты</b><div class="sc-line s"></div></div></div>', { active: 1, url: 'claude.ai/projects' }),
  'new-project': () => cFrame('<div class="sc-title">Create a project</div><span>What are you working on?</span>' + E('field-name', 'sc-input', '<span style="color:#111d35">' + esc(brand()) + '</span>') + '<span>What are you trying to achieve?</span><div class="sc-input" style="height:30px">Describe your project…</div><div class="row" style="justify-content:flex-end;gap:6px"><div class="sc-btn">Cancel</div>' + E('btn-create', 'sc-btn dark', 'Create project') + '</div>', { active: 1, url: 'claude.ai/projects/new' }),
  project: () => cFrame('<div class="sc-row"><div class="stk" style="gap:7px">' + projSide() + '</div><div class="stk" style="gap:7px">' + E('instr', 'sc-box', '<b>Instructions</b><span>Add instructions to tailor Claude’s responses</span>') + E('files-add', 'sc-box', '<div class="spr"><b>Files</b><span style="font-weight:800">+</span></div><span>Add PDFs, documents…</span>') + '</div></div>', { active: 1, url: 'claude.ai/project' }),
  instructions: () => cFrame('<div class="sc-title">Set project instructions</div><span>Provide Claude with relevant instructions and information.</span>' + E('textarea', 'sc-input', '<span style="color:#111d35"># Инструкция для Claude — ' + esc(brand()) + '</span><br>Меня зовут ' + who() + '…', 'min-height:38%') + '<div class="row" style="justify-content:flex-end;gap:6px"><div class="sc-btn">Cancel</div>' + E('btn-save', 'sc-btn dark', 'Save instructions') + '</div>', { active: 1, url: 'claude.ai/project' }),
  'project-add': () => cFrame('<div class="sc-row"><div class="stk" style="gap:7px">' + projSide() + '</div><div class="stk" style="gap:7px"><div class="sc-box"><b>Instructions</b><div class="sc-line m"></div></div><div class="sc-box"><div class="spr"><b>Files</b><span style="font-weight:800">+</span></div></div></div></div><div class="sc-menu" style="right:12px;top:52%">' + E('menu-upload', 'sc-item', 'Upload from device') + '<div class="sc-item">Add text content</div><div class="sc-item">Google Drive</div></div>', { active: 1, url: 'claude.ai/project' }),
  'project-files': () => cFrame('<div class="sc-row"><div class="stk" style="gap:7px">' + projSide() + '</div><div class="stk" style="gap:7px"><div class="sc-box"><b>Instructions</b><div class="sc-line m"></div></div>' + E('files-list', 'sc-box', '<b>Files</b>' + ['CLAUDE.md', 'context/business.md', 'agents/marketing/scripts.md'].map((n) => '<span style="font:9.5px var(--mono)">' + n + '</span>').join('')) + '</div></div>', { active: 1, url: 'claude.ai/project' }),
  settings: () => cFrame('<div class="sc-title">Capabilities</div><div class="sc-box"><b>Artifacts</b><div class="sc-line m"></div></div><div class="sc-box"><div class="spr"><b>Skills</b>' + E('btn-upload', 'sc-btn', 'Upload skill') + '</div><span>Teach Claude repeatable tasks</span><div class="spr"><span style="font-family:var(--mono)">canvas-design</span>' + E('skill-toggle', 'sc-btn dark', 'On') + '</div></div>', { side: '<div class="sc-item strong">Settings</div><div class="sc-item">Profile</div><div class="sc-item">Appearance</div>' + E('tab-capabilities', 'sc-item strong', 'Capabilities') + '<div class="sc-item">Connectors</div><div class="sc-item">Billing</div>', noUser: 1, url: 'claude.ai/settings' }),
  'settings-connectors': () => cFrame('<div class="sc-title">Connectors</div><div class="sc-box"><div class="spr"><b>Chat Place</b>' + E('btn-connect', 'sc-btn dark', 'Connect') + '</div></div><div class="sc-box"><div class="spr"><b>Google Drive</b><div class="sc-btn">Connect</div></div></div><div class="sc-box"><div class="spr"><b>Windsor.ai</b><div class="sc-btn">Connect</div></div></div>', { side: '<div class="sc-item strong">Settings</div><div class="sc-item">Profile</div><div class="sc-item">Capabilities</div>' + E('tab-connectors', 'sc-item strong', 'Connectors') + '<div class="sc-item">Billing</div>', noUser: 1, url: 'claude.ai/settings/connectors' }),
  chat: () => cFrame('<div class="sc-title" style="margin-top:12%;text-align:center">' + esc(brand()) + '</div>' + E('input', 'sc-input', '<span style="color:#111d35">Вставь промпт и нажми Enter…</span>') + '<span style="text-align:center">Claude сам возьмёт файлы и скиллы проекта</span>', { active: 1 }),
  'chat-answer': () => cFrame('<div class="sc-box" style="justify-self:end;max-width:70%"><span>Промпт из задания…</span></div>' + E('answer', 'sc-box', '<b>Готово. Вот 5 сценариев:</b><div class="sc-line m"></div><div class="sc-line"></div><div class="sc-line s"></div><div class="sc-btn">Copy</div>') + '<div class="sc-input">Reply…</div>', { active: 1 }),
  'cabinet-file': () => oFrame('<div class="spr"><div class="sc-title" style="font-family:var(--mono)">CLAUDE.md</div><div class="row" style="gap:4px">' + E('btn-copy', 'sc-btn dark', 'Скопировать') + '<div class="sc-btn">.md</div></div></div><div class="sc-box"><b># Инструкция для Claude</b><div class="sc-line m"></div><div class="sc-line"></div><div class="sc-line s"></div></div>'),
  'cabinet-files': () => oFrame('<div class="spr"><div class="sc-title">Проект</div>' + E('btn-zip', 'sc-btn dark', 'Скачать всё (.zip)') + '</div>' + ['CLAUDE.md', 'context/business.md', 'agents/strategy/market.md'].map((n) => '<div class="sc-box" style="padding:4px 8px"><span style="font:9.5px var(--mono)">' + n + '</span></div>').join('')),
  'cabinet-prompt': () => oFrame('<div class="sc-title">Задание: сделай 5 сценариев</div><div class="sc-box" style="font:9.5px var(--mono)">Напиши 5 сценариев рилсов для «' + esc(brand()) + '»…</div>' + E('btn-copy-prompt', 'sc-btn dark', 'Скопировать промпт') + '<div class="sc-input">Вставь результат из Claude</div>'),
  'academy-skill': () => oFrame('<div class="sc-title">Решение · Скилл AICEX</div><div class="sc-box"><b>Лид-магнит</b><span style="font-family:var(--mono)">lead-magnet</span><div class="sc-line m"></div><div class="row" style="gap:4px">' + E('btn-skill', 'sc-btn dark', 'Скачать скилл') + '<div class="sc-btn">Как установить</div></div></div>'),
  office: () => {
    const room = (t, n, id, mk, ag) => E(id, 'sc-box', '<b>' + t + '</b><div>' + Array.from({ length: n }, (_, i) => i === 0 && ag ? E('agent', '', '', 'display:inline-block;width:12px;height:12px;border-radius:50%;background:#2f6bff;margin:2px') : '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#dfe4ec;margin:3px"></span>').join('') + (mk ? E('marker', '', '!', 'display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:#e79a00;color:#1c1300;font-weight:800;margin:2px') : '') + '</div>');
    return oFrame('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + room('Стратегия', 3, '', 0, 1) + room('Маркетинг', 4, 'room', 1, 0) + room('Продажи', 0, '', 0, 0) + room('Реклама', 0, '', 0, 0) + '</div>');
  }
};
function screenHTML(sc, t, n) { CUR.t = t; CUR.n = n || 1; const h = (SCREENS[sc] || SCREENS.home)(); CUR.t = null; return h; }
function showGuide(id, i) {
  const g = A.guides.find((x) => x.id === id); if (!g) return;
  i = Math.max(0, Math.min(i || 0, g.steps.length - 1));
  const s = g.steps[i], n = g.steps.length;
  UI.tour = { id: id, i: i };
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Куда нажать · ' + g.minutes + ' мин</span><b class="h2">' + esc(g.title) + '</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="tour"><div class="stk">' + screenHTML(s.screen, s.target, i + 1) + '<div class="dots">' + g.steps.map((_, k) => '<i class="' + (k < i ? 'ok' : k === i ? 'cur' : '') + '"></i>').join('') + '</div></div>' +
    '<div class="stk" style="gap:12px"><span class="eb">Шаг ' + (i + 1) + ' из ' + n + '</span><div class="tstep"><i>' + (i + 1) + '</i><div>' + rich(s.text) + '</div></div>' + (i === 0 ? '<p class="mut sm" style="margin:0">' + esc(g.why) + '</p>' : '') +
    '<div class="row"><button class="ab" data-act="tour" data-id="' + id + '" data-i="' + (i - 1) + '"' + (i ? '' : ' disabled') + '>' + icon('left') + 'Назад</button>' + (i < n - 1 ? '<button class="ab pri" data-act="tour" data-id="' + id + '" data-i="' + (i + 1) + '">Дальше ' + icon('right') + '</button>' : '<button class="ab pri" data-act="close">' + icon('check') + 'Готово</button>') + '</div>' +
    '<p class="mut sm" style="margin:0">Экран нарисован схемой. Надписи — как в английской версии Claude.</p></div></div>', true);
}
function showGuides() {
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Инструкции</span><b class="h2">Куда нажимать</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="lib">' + A.guides.map((g) => '<button class="box" style="text-align:left" data-act="guide" data-id="' + g.id + '"><span class="pill amber">' + icon('pointer', 12) + g.minutes + ' мин · ' + g.steps.length + ' ' + plural(g.steps.length, 'шаг', 'шага', 'шагов') + '</span><b>' + esc(g.title) + '</b><span class="mut sm">' + esc(g.why) + '</span></button>').join('') + '</div>' +
    '<div class="stk"><span class="eb">Словарь</span><div class="lib">' + Object.keys(A.glossary).map((k) => '<div class="box"><b style="text-transform:capitalize">' + esc(k) + '</b><span class="mut sm">' + esc(A.glossary[k]) + '</span></div>').join('') + '</div></div>', true);
}

// ---------- Mentor ----------
async function showMentor() {
  openModal('<div class="adh"><b class="h2">Наставник</b><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div><div class="think"><span class="spin"></span>Загружаю вопросы и поток…</div>', true);
  let disp = [], board = [], names = {};
  try {
    const r = await Promise.all([RT.db.collection('mentor').get(), RT.db.collection('board').get()]);
    disp = r[0].docs.map((d) => Object.assign({ id: d.id }, clone(d.data() || {}))).filter((x) => x.status === 'open' && x.v === 2);
    board = r[1].docs.map((d) => Object.assign({ id: d.id }, clone(d.data() || {}))).filter((x) => x.v === 2);
    const ids = Array.from(new Set(disp.map((x) => x.id).concat(board.map((x) => x.id))));
    names = RT.user && ids.length ? await RT.user.profiles(ids) : {};
  } catch (e) { toast('Не получилось загрузить данные наставника.'); }
  const nm = (id) => (names[id] && names[id].name) || 'Ученик';
  if ($('#aModal').hidden) return;
  openModal('<div class="adh"><div class="stk" style="gap:2px"><span class="eb">Наставник</span><b class="h2">Вопросы учеников и поток</b></div><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div>' +
    '<div class="stk"><span class="eb">Ждут ответа · ' + disp.length + '</span>' + (disp.length ? disp.map((x) => { const s = STEP[x.step]; return '<div class="box"><div class="spr"><b>' + esc(nm(x.id)) + ' · шаг ' + esc(x.step) + ' «' + esc(s ? s.title : '') + '»</b><span class="mut sm">' + ago(x.at) + '</span></div>' +
      (x.note ? '<span class="sm">' + esc(x.note) + '</span>' : '') + '<div class="pre">' + esc(String(x.result || '').slice(0, 1500)) + '</div>' +
      '<textarea class="ta" id="arep-' + x.id + '" rows="2" placeholder="Ответ ученику: что хорошо и что поправить"></textarea><div class="row"><button class="ab pri sm" data-act="mentor-ok" data-id="' + x.id + '">Принять</button><button class="ab sm" data-act="mentor-back" data-id="' + x.id + '">Вернуть с комментарием</button></div></div>'; }).join('') : '<p class="mut sm" style="margin:0">Вопросов нет.</p>') + '</div>' +
    '<div class="stk"><span class="eb">Поток · ' + board.length + '</span>' + (board.length ? '<div class="tbl2"><table><thead><tr><th>Ученик</th><th>Шаг</th><th>Агенты</th><th>Опыт</th><th>Был(а)</th></tr></thead><tbody>' +
      board.sort((a, b) => (b.at || 0) - (a.at || 0)).map((x) => '<tr><td>' + esc(nm(x.id)) + '</td><td>' + esc(x.current || '0.1') + '</td><td>' + (x.agents || 0) + '/24</td><td>' + fmt(x.xp) + '</td><td>' + (x.at && Date.now() - x.at > 3 * 864e5 ? '<span class="pill amber">' + ago(x.at) + '</span>' : ago(x.at)) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="mut sm" style="margin:0">Пока никто не начал.</p>') + '</div>', true);
}
async function mentorDecide(uid, ok) {
  const reply = (($('#arep-' + uid) || {}).value || '').trim();
  if (!ok && !reply) { toast('Напиши, что поправить.'); return; }
  try { await RT.db.doc('mentor/' + uid).update({ status: 'resolved', decision: ok ? 'accept' : 'revise', reply: reply || 'Принято. Иди дальше.', resolvedAt: Date.now() }); toast(ok ? 'Принято' : 'Вернули на доработку'); showMentor(); }
  catch (e) { toast('Не получилось сохранить ответ.'); }
}
async function mentorInbox() {
  if (MODE !== 'cloud' || !RT.uid) return;
  try {
    const d = await RT.db.doc('mentor/' + RT.uid).get();
    if (!d.exists) return;
    const m = d.data();
    if (m.status !== 'resolved' || m.v !== 2) return;
    const x = S.steps[m.step];
    if (x) {
      x.mentor = 'resolved';
      if (m.decision === 'accept') x.check = { verdict: 'accepted', by: 'mentor', praise: m.reply, fixes: [], criteria: [] };
      else x.check = { verdict: 'revise', by: 'mentor', praise: '', fixes: [m.reply], criteria: [] };
      if (m.decision === 'accept' && !x.xpTask) { x.xpTask = true; S.xp += A.xp.task; }
    }
    save();
    toast('Наставник ответил по шагу ' + m.step + ': ' + (m.decision === 'accept' ? 'принято' : 'нужно поправить'), 'hire');
    await RT.db.doc('mentor/' + RT.uid).update({ status: 'seen' });
  } catch (e) { /* optional */ }
}

// ---------- Demo: AICEX halfway through ----------
function enterDemo() {
  closeModal();
  RT.saved = { S: S, MODE: MODE };
  MODE = 'demo-build';
  S = fresh();
  S.profile = { name: 'Илья', project: 'AICEX', niche: 'ИИ-офис и нейроворонки для экспертов', goal: 'leads', started: Date.now() - 24 * 864e5 };
  S.heads = { ceo: 'Илья', marketing: 'Фируза', sales: 'Богдан', traffic: 'Нуркен' };
  const until = STEP['4.1'].index;
  STEPS.forEach((s, i) => {
    if (i >= until) return;
    const x = st(s.id), at = Date.now() - (until - i) * 864e5 * 0.8;
    x.seen = true; x.answers = {}; s.questions.forEach((q) => { x.answers[q.id] = plain(q.example).replace(/^Как у AICEX:\s*/i, ''); });
    if (s.id === '0.1') x.answers.team = 'Фируза — маркетинг\nБогдан — продажи\nНуркен — реклама в Meta';
    x.answered = true; x.xpAns = true; x.giftsTaken = true; x.xpGift = true;
    x.result = 'Пример результата AICEX: ' + plain(s.task.result);
    x.check = { verdict: 'accepted', by: 'ai', criteria: s.task.check.map(() => ({ ok: true, note: '' })), praise: 'Рабочий результат на своём контексте.', fixes: [] };
    x.xpTask = true; x.regSaved = true; x.xpReg = true; x.hired = true; x.hiredAt = at;
    S.xp += A.xp.answers + A.xp.gifts + A.xp.task + A.xp.regulation;
    if (s.boss) { if (s.id === '3.3') x.boss = { status: 'todo', due: Date.now() + 3 * 864e5 }; else { x.boss = { status: 'done', proof: s.boss.placeholder || 'Готово', at: at }; S.xp += A.xp.boss; if (A.bossBadge[s.id]) S.badges.push(A.bossBadge[s.id]); } }
  });
  S.badges.push('office-open', 'first-agent', 'content-factory');
  const days = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(dateStr(d)); }
  S.streak = { count: 6, last: dateStr(), best: 11, days: days, freezeWeek: null };
  S.guideAt = '4.1';
  MODE = 'demo';
  UI.view = 'track'; UI.step = null; UI.stage = {}; UI.panel = true;
  renderAll();
  if (window.OFFICE) { window.OFFICE.sync(); window.OFFICE.toPlan(); }
}
function exitDemo() {
  if (MODE !== 'demo' || !RT.saved) return;
  S = RT.saved.S; MODE = RT.saved.MODE; RT.saved = null;
  UI.view = 'track'; UI.step = null; UI.stage = {};
  renderAll();
  if (window.OFFICE) { window.OFFICE.sync(); window.OFFICE.toPlan(); }
  if (!S.profile) showOnboarding();
}
function resetModal() {
  openModal('<div class="adh"><b class="h2">Начать заново?</b><button class="icob" data-act="close" aria-label="Закрыть">' + icon('x') + '</button></div><p style="margin:0">Удалятся ответы, агенты и опыт. Если файлы нужны — сначала скачай проект архивом.</p>' +
    '<div class="row"><button class="ab" data-act="reset-ok" style="color:var(--bad)">Удалить и начать заново</button><button class="ab pri" data-act="close">Оставить</button></div>');
}
function resetAll() {
  S = fresh(); UI.view = 'track'; UI.step = null; UI.stage = {};
  save(); closeModal(); renderAll();
  if (window.OFFICE) { window.OFFICE.sync(); window.OFFICE.toPlan(); }
  showOnboarding();
}
