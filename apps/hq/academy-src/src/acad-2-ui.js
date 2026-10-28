// ---------- HUD ----------
const canMentor = () => MODE === 'cloud' && (RT.owner || RT.admin);
function renderHUD() {
  const h = $('#aHud');
  h.classList.toggle('on', !!S.profile || MODE === 'demo');
  if (!S.profile && MODE !== 'demo') { h.innerHTML = '<button data-act="guides" title="Инструкции">' + icon('help') + '<span>Как это работает</span></button>'; return; }
  const r = rank(), pct = r.next ? Math.round(((S.xp - r.xp) / (r.next.xp - r.xp)) * 100) : 100;
  h.innerHTML = '<div class="xp"><b>' + esc(r.name) + ' · ' + fmt(S.xp) + ' опыта</b><span>' + (r.next ? 'до «' + esc(r.next.name) + '» ' + fmt(r.next.xp - S.xp) : 'высший ранг') + '</span><div class="bar"><i style="width:' + Math.max(3, Math.min(100, pct)) + '%"></i></div></div>' +
    '<span class="chip" title="Агенты в офисе">' + icon('user', 13) + ' ' + hiredSet().size + '/24</span>' +
    '<span class="chip" title="Дней подряд">' + icon('flame', 13) + ' ' + S.streak.count + '</span>' +
    '<button data-act="plan" title="Весь офис сверху">' + icon('track') + '<span>План</span></button>' +
    '<button data-act="project">' + icon('folder') + '<span>Проект</span></button>' +
    '<button data-act="library">' + icon('gift') + '<span>Решения</span></button>' +
    '<button data-act="team">' + icon('team') + '<span>Команда</span></button>' +
    (canMentor() ? '<button data-act="mentor">' + icon('mentor') + '<span>Наставник</span></button>' : '') +
    '<button data-act="guides" title="Инструкции «куда нажать»">' + icon('help') + '</button>';
}
function renderBanner() {
  const b = $('#aBanner');
  b.hidden = MODE !== 'demo';
  b.innerHTML = MODE === 'demo' ? icon('eye') + '<span>Пример: офис AICEX на середине трека. Здесь ничего не сохраняется.</span><button class="ab sm" data-act="exit-demo">Выйти из примера</button>' : '';
}

// ---------- Panel ----------
function setPanel(on) {
  UI.panel = on;
  renderPanel();
  if (window.OFFICE) window.OFFICE.resize();
}
function renderPanel() {
  const p = $('#aPanel');
  const has = !!S.profile || MODE === 'demo';
  document.body.classList.toggle('panel-off', !has || !UI.panel);
  p.hidden = !has || !UI.panel;
  $('#aShow').hidden = !has;
  if (!has) return;
  const keep = {};
  $$('#aPanel textarea[id], #aPanel input[id], #aPanel select[id]').forEach((el) => { keep[el.id] = el.value; });
  const scroll = ($('#aPanel .apb') || {}).scrollTop || 0;
  const sameView = p.dataset.view === (UI.view + ':' + UI.step + ':' + stageOf(UI.step));
  p.innerHTML = UI.view === 'step' && UI.step ? stepPanel(STEP[UI.step]) : trackPanel();
  p.dataset.view = UI.view + ':' + UI.step + ':' + stageOf(UI.step);
  Object.keys(keep).forEach((id) => { const el = document.getElementById(id); if (el && el.dataset.keep !== 'no' && !el.hasAttribute('data-ans') && el.value !== keep[id]) el.value = keep[id]; });
  if (sameView) { const b = $('#aPanel .apb'); if (b) b.scrollTop = scroll; }
}
const storeLine = () => MODE === 'cloud' ? 'Прогресс сохраняется в claude.ai' : MODE === 'demo' ? 'Пример — ничего не сохраняется' : 'Прогресс сохраняется в этом браузере';
function trackPanel() {
  const cur = currentStep();
  let h = '<div class="aph"><div class="ttl"><b>' + esc(brand()) + '</b><span>Трек «Свой ИИ-офис» · ' + doneCount() + ' из ' + STEPS.length + ' шагов</span></div><button class="icob" data-act="panel-off" title="Скрыть панель и походить по офису">' + icon('panel') + '</button></div><div class="apb">';
  if (cur) {
    const m = MOD[cur.module];
    h += '<div class="box amber"><div class="spr"><span class="eb">Модуль ' + m.id + ' · ' + esc(m.title) + '</span><span class="pill amber">' + icon('clock', 12) + cur.minutes + ' мин</span></div>' +
      '<b class="h2">' + esc(cur.agent ? 'Нанять «' + cur.title + '»' : cur.title) + '</b>' +
      '<div class="say"><i></i><div>' + rich(cur.brief) + '</div></div>' +
      '<div class="row"><button class="ab pri" data-act="open-step" data-id="' + cur.id + '">' + (st(cur.id).answered ? 'Продолжить' : 'Начать шаг') + ' ' + icon('right') + '</button><button class="ab ghost" data-act="focus" data-id="' + cur.id + '">' + icon('pointer') + 'Показать место в офисе</button></div></div>';
  } else {
    h += '<div class="box ok"><b class="h2">Офис собран</b><p class="mut sm" style="margin:0">Все 24 агента на местах. Дальше офис работает по регламентам из папки regulations.</p><div class="row"><button class="ab pri" data-act="project">' + icon('folder') + 'Открыть проект</button></div></div>';
  }
  const bosses = STEPS.filter((s) => s.boss && isDone(s.id) && !(st(s.id).boss && st(s.id).boss.status === 'done'));
  if (bosses.length) h += '<div class="stk"><span class="eb">Боссы ждут</span>' + bosses.map((s) => '<button class="srow cur" data-act="boss" data-id="' + s.id + '"><span class="n">' + icon('crown', 13) + '</span><span><b>' + esc(s.boss.task) + '</b><small>Босс шага ' + s.id + ' · доказательство: ' + esc(s.boss.proof) + '</small></span><em>+' + A.xp.boss + '</em></button>').join('') + '</div>';
  A.modules.forEach((m) => {
    const steps = STEPS.filter((s) => s.module === m.id), done = steps.filter((s) => isDone(s.id)).length;
    h += '<div class="mod"><div class="mod-h"><b>' + m.id + ' · ' + esc(m.title) + '</b><span>' + done + ' из ' + steps.length + ' · ' + esc(roomName(m.room)) + '</span></div>' +
      steps.map((s) => {
        const d = isDone(s.id), c = cur && cur.id === s.id;
        return '<button class="srow' + (d ? ' done' : '') + (c ? ' cur' : '') + '" data-act="open-step" data-id="' + s.id + '"' + (d || c ? '' : ' disabled') + '>' +
          '<span class="n">' + (d ? icon('check', 13) : !c ? icon('lock', 12) : s.id) + '</span><span><b>' + esc(s.agent ? s.title : s.title) + '</b><small>' + (s.agent ? (d ? 'Агент в офисе' : 'Агент · ') + (d ? '' : esc(roomName(s.room))) : 'Ресепшн') + (s.boss ? ' · босс' : '') + '</small></span>' +
          (d ? '' : '<em>+' + stepXP(s) + '</em>') + '</button>';
      }).join('') + '</div>';
  });
  h += '</div><div class="apf"><span class="mut sm" style="flex:1">' + storeLine() + (RT.ready ? aiOn() ? ' · ИИ-проверка включена' : ' · ИИ выключен' : '') + '</span>' +
    (MODE === 'demo' ? '<button class="ab sm" data-act="exit-demo">Выйти из примера</button>' : '<button class="ab ghost sm" data-act="reset">Начать заново</button>') + '</div>';
  return h;
}

// ---------- Step ----------
const accepted = (c) => !!c && (c.verdict === 'accepted' || c.verdict === 'accepted_with_tips');
const isOpenStep = (id) => isDone(id) || (currentStep() && currentStep().id === id);
function stageOf(id) {
  if (!id) return '';
  if (UI.stage[id]) return UI.stage[id];
  const x = st(id);
  if (x.hired) return 'hire';
  if (x.regSaved) return 'hire';
  if (accepted(x.check)) return 'regulation';
  if (x.giftsTaken) return 'work';
  if (x.answered) return 'gifts';
  if (x.seen) return 'questions';
  return 'task';
}
function stageAllowed(id, k) {
  const x = st(id);
  if (k === 'gifts') return !!x.answered;
  if (k === 'work') return !!x.giftsTaken;
  if (k === 'regulation') return accepted(x.check) || !!x.hired;
  if (k === 'hire') return !!x.regSaved || !!x.hired;
  return true;
}
function stageDone(id, k) {
  const x = st(id);
  return !!({ task: x.seen, questions: x.answered, gifts: x.giftsTaken, work: accepted(x.check), regulation: x.regSaved, hire: x.hired }[k]);
}
function stepPanel(s) {
  const k = stageOf(s.id);
  const head = '<div class="aph"><button class="icob" data-act="track" title="К треку">' + icon('left') + '</button><div class="ttl"><b>' + esc(s.agent ? 'Нанять «' + s.title + '»' : s.title) + '</b><span>Шаг ' + s.id + ' · ' + esc(MOD[s.module].title) + ' · ' + esc(roomName(s.room)) + '</span></div><button class="icob" data-act="panel-off" title="Скрыть панель">' + icon('panel') + '</button></div>';
  const bar = '<nav class="stages" aria-label="Этапы шага">' + STAGES.map((x, i) => {
    const label = x[0] === 'hire' && !s.agent ? 'Готово' : x[1];
    return '<button data-act="stage" data-id="' + s.id + '" data-k="' + x[0] + '"' + (x[0] === k ? ' aria-current="step"' : '') + (stageAllowed(s.id, x[0]) ? '' : ' disabled') + ' class="' + (stageDone(s.id, x[0]) ? 'done' : '') + '"><i>' + (stageDone(s.id, x[0]) ? icon('check', 10) : i + 1) + '</i>' + label + '</button>';
  }).join('') + '</nav>';
  return head + '<div class="apb">' + bar + STAGE[k](s) + '</div>';
}
function setStage(id, k) { UI.stage[id] = k; renderPanel(); const b = $('#aPanel .apb'); if (b) b.scrollTop = 0; }

const STAGE = {};
STAGE.task = (s) => {
  const gifts = s.gifts.length;
  let h = '<div class="say"><i></i><div>' + rich(s.brief) + '</div></div>';
  h += '<div class="box blue"><span class="eb">Как это устроено в AICEX</span>' + rich(s.aicex.text) +
    (s.aicex.links.length ? '<div class="row">' + s.aicex.links.map((l) => '<a class="ab sm" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.title) + ' ' + icon('ext', 13) + '</a>').join('') + '</div>' : '') + '</div>';
  h += '<div class="stk"><span class="eb">Что получишь</span><div class="row">' +
    (s.agent ? '<span class="pill blue">' + icon('user', 12) + 'Агент «' + esc(s.title) + '» в отдел «' + esc(roomName(s.room)) + '»</span>' : '<span class="pill blue">' + icon('folder', 12) + 'Твой офис и проект в Claude</span>') +
    '<span class="pill amber">' + icon('gift', 12) + gifts + ' ' + plural(gifts, 'готовое решение', 'готовых решения', 'готовых решений') + '</span>' +
    '<span class="pill">' + icon('file', 12) + (s.agent ? agentPath(s) : s.context || 'CLAUDE.md') + '</span>' +
    '<span class="pill amber">' + icon('star', 12) + '+' + stepXP(s) + ' опыта</span></div></div>';
  h += '<div class="stk"><span class="eb">Что сделаешь</span><ol class="nl">' +
    '<li><span>Ответишь на ' + s.questions.length + ' ' + plural(s.questions.length, 'вопрос', 'вопроса', 'вопросов') + ' про свой бизнес. Не знаешь ответ — жми «Не знаю», там инструкция, пример и шаблон.</span></li>' +
    '<li><span>Заберёшь готовые решения AICEX: скиллы, артефакты, шаблоны.</span></li>' +
    '<li><span>Запустишь их в своём проекте Claude и принесёшь результат.</span></li>' +
    '<li><span>Утвердишь регламент: когда агент работает и кто проверяет.</span></li></ol></div>';
  if (s.boss) h += '<div class="box amber"><span class="eb">' + icon('crown', 12) + ' Босс шага</span><b>' + esc(s.boss.task) + '</b><span class="mut sm">После найма. На это ' + s.boss.days + ' ' + plural(s.boss.days, 'день', 'дня', 'дней') + ', за победу +' + A.xp.boss + ' опыта.</span></div>';
  h += '<button class="ab pri full" data-act="to-questions" data-id="' + s.id + '">Начать: вопросы ' + icon('right') + '</button>';
  return h;
};

const HELP_LABEL = { instruction: 'Инструкция', recommendation: 'Совет', lecture: 'Мини-лекция', skill: 'Скилл', material: 'Материал AICEX', example: 'Как у AICEX', template: 'Шаблон' };
function helpHTML(s, q) {
  return '<div class="help">' + q.help.map((x, i) => '<div class="hl"><span class="k">' + (HELP_LABEL[x.type] || x.type) + '</span><b>' + esc(x.title) + '</b>' + rich(x.text) +
    (x.prompt ? '<div class="pre">' + esc(fill(x.prompt, answersOf(s.id))) + '</div>' : '') +
    '<div class="row">' + (x.prompt ? '<button class="ab sm" data-act="copy-help" data-id="' + s.id + '" data-q="' + q.id + '" data-i="' + i + '">' + icon('copy', 13) + 'Скопировать запрос</button>' : '') +
    (x.url ? '<a class="ab sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">Открыть ' + icon('ext', 13) + '</a>' : '') +
    (x.type === 'template' ? '<button class="ab sm" data-act="use-template" data-id="' + s.id + '" data-q="' + q.id + '" data-i="' + i + '">' + icon('template', 13) + 'Вставить в ответ</button>' : '') + '</div></div>').join('') +
    '<button class="ab ghost sm" data-act="later" data-id="' + s.id + '" data-q="' + q.id + '">Отвечу позже — пока пропустить</button></div>';
}
STAGE.questions = (s) => {
  const ans = answersOf(s.id);
  let h = '<p class="mut sm" style="margin:0">Ответы станут контекстом агента. Пиши как есть: коротко, своими словами, можно списком.</p>';
  h += s.questions.map((q, i) => {
    const k = s.id + ':' + q.id, sg = UI.sugg[k];
    return '<div class="q"><div class="ql"><i>' + (i + 1) + '</i><div><b>' + terms(inline(q.label)) + '</b><small>' + esc(plain(q.hint)) + '</small></div></div>' +
      '<label class="sr" for="aq-' + s.id.replace('.', '-') + '-' + q.id + '" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">' + esc(plain(q.label)) + '</label>' +
      '<textarea class="ta" id="aq-' + s.id.replace('.', '-') + '-' + q.id + '" data-ans="' + s.id + '" data-q="' + q.id + '" rows="' + q.rows + '" placeholder="Твой ответ">' + esc(ans[q.id] || '') + '</textarea>' +
      '<div class="tools"><button class="ab sm' + (UI.help[k] ? ' amber' : '') + '" data-act="dunno" data-id="' + s.id + '" data-q="' + q.id + '">' + icon('help', 13) + 'Не знаю</button>' +
      '<button class="ab ghost sm" data-act="example" data-id="' + s.id + '" data-q="' + q.id + '">' + icon('eye', 13) + (UI.show[k] ? 'Скрыть пример' : 'Пример AICEX') + '</button>' +
      (aiOn() ? '<button class="ab ghost sm" data-act="suggest" data-id="' + s.id + '" data-q="' + q.id + '"' + (sg && sg.busy ? ' disabled' : '') + '>' + icon('ai', 13) + 'Помочь с ИИ</button>' : '') + '</div>' +
      (UI.show[k] ? '<div class="exm"><b>Как это заполнено у AICEX</b>' + esc(plain(q.example)) + '</div>' : '') +
      (UI.help[k] ? helpHTML(s, q) : '') +
      (sg ? sg.busy ? '<div class="think"><span class="spin"></span>Придумываю 3 варианта…</div>' : sg.err ? '<p class="mut sm" style="margin:0">' + esc(sg.err) + '</p>' :
        '<div class="sug"><span class="mut sm">Нажми на вариант — он встанет в ответ.</span>' + sg.list.map((x, j) => '<button data-act="pick" data-id="' + s.id + '" data-q="' + q.id + '" data-i="' + j + '">' + esc(x) + '</button>').join('') + '</div>' : '') +
      '</div>';
  }).join('');
  h += '<button class="ab pri full" data-act="answers-save" data-id="' + s.id + '">' + icon('check') + 'Сохранить ответы и забрать решения</button>';
  return h;
};
const GIFT_KIND = { skill: 'Скилл', artifact: 'Артефакт', product: 'Продукт AICEX', connector: 'Коннектор', template: 'Шаблон' };
function giftHTML(g, sid, i) {
  const acts = [];
  if (g.type === 'skill') { acts.push('<button class="ab sm" data-act="guide" data-id="claude-skill-upload">' + icon('pointer', 13) + 'Как установить</button>'); acts.push('<a class="ab sm" href="https://skills.aicex.club" target="_blank" rel="noopener">Пак скиллов ' + icon('ext', 13) + '</a>'); }
  if (g.type === 'artifact' || g.type === 'product') acts.push('<a class="ab sm" href="' + esc(g.url) + '" target="_blank" rel="noopener">Открыть ' + icon('ext', 13) + '</a>');
  if (g.type === 'connector') acts.push('<button class="ab sm" data-act="guide" data-id="' + esc(g.guide || 'claude-connector') + '">' + icon('pointer', 13) + 'Как подключить</button>');
  if (g.type === 'template') acts.push('<button class="ab sm" data-act="template" data-id="' + sid + '" data-i="' + i + '">' + icon('template', 13) + 'Открыть шаблон</button>');
  if (g.guide && g.type !== 'connector' && g.type !== 'skill') acts.push('<button class="ab ghost sm" data-act="guide" data-id="' + esc(g.guide) + '">Куда нажать</button>');
  return '<div class="gift"><span class="gi ' + g.type + '">' + icon(g.type === 'skill' ? 'skill' : g.type, 18) + '</span><div><span class="k">' + GIFT_KIND[g.type] + '</span><b>' + esc(g.title) + '</b>' +
    (g.name ? '<code>' + esc(g.name) + '</code>' : '') + '<p>' + esc(plain(g.what)) + '</p><div class="row">' + acts.join('') + '</div></div></div>';
}
STAGE.gifts = (s) => {
  const x = st(s.id);
  return '<p class="mut sm" style="margin:0">Это готовые решения из офиса AICEX. Они твои: лежат в разделе «Решения» и в файле агента.</p>' +
    s.gifts.map((g, i) => giftHTML(g, s.id, i)).join('') +
    '<button class="ab pri full" data-act="gifts-take" data-id="' + s.id + '">' + (x.giftsTaken ? 'К заданию ' : 'Забрать решения и к заданию ') + icon('right') + '</button>';
};
STAGE.work = (s) => {
  const x = st(s.id), t = s.task, busy = UI.busy['chk-' + s.id];
  let h = '<b class="h3">' + esc(t.title) + '</b><ol class="nl">' + t.steps.map((y) => '<li><span>' + terms(inline(y)) + '</span></li>').join('') + '</ol>';
  if (s.id === '0.1') h += '<div class="box blue"><div class="spr"><b>Твоя инструкция CLAUDE.md готова</b><button class="ab sm pri" data-act="copy-claude">' + icon('copy', 13) + 'Скопировать</button></div><span class="mut sm">Офис собрал её из твоих ответов. Вставь её в Instructions проекта Claude.</span></div>';
  h += '<div class="stk"><div class="spr"><span class="eb">Промпт с твоими ответами</span><button class="ab ghost sm" data-act="guide" data-id="claude-prompt">' + icon('pointer', 13) + 'Куда вставить</button></div><div class="pre">' + esc(fill(t.prompt, x.answers)) + '</div>' +
    '<button class="ab sm" data-act="copy-prompt" data-id="' + s.id + '">' + icon('copy', 13) + 'Скопировать промпт</button></div>';
  h += '<div class="stk"><label class="eb" for="ares-' + s.id.replace('.', '-') + '">' + esc(plain(t.result)) + '</label>' +
    (t.resultType === 'link' ? '<input class="in" id="ares-' + s.id.replace('.', '-') + '" data-res="' + s.id + '" placeholder="https://… и пара слов, что получилось" value="' + esc(x.result || '') + '">'
      : '<textarea class="ta" id="ares-' + s.id.replace('.', '-') + '" data-res="' + s.id + '" rows="6" placeholder="Вставь результат из Claude">' + esc(x.result || '') + '</textarea>') + '</div>';
  if (busy) h += '<div class="think"><span class="spin"></span>Проверяю результат по 3 критериям…</div>';
  else if (UI.err[s.id]) h += '<div class="box bad"><span>' + esc(UI.err[s.id]) + '</span></div>';
  if (x.check && !busy) {
    const c = x.check, cls = c.verdict === 'accepted' ? 'ok' : c.verdict === 'accepted_with_tips' ? 'amber' : 'bad';
    h += '<div class="box ' + cls + '"><b>' + (c.verdict === 'accepted' ? 'Принято!' : c.verdict === 'accepted_with_tips' ? 'Принято. Вот что можно улучшить' : 'Нужно доработать') + '</b>' +
      (c.praise ? '<span class="sm">' + esc(c.praise) + '</span>' : '') +
      (c.by !== 'local' ? '<ul class="crit">' + t.check.map((y, i) => { const z = (c.criteria || [])[i] || { ok: true }; return '<li><span class="' + (z.ok ? 'y' : 'n') + '">' + icon(z.ok ? 'check' : 'x', 15) + '</span><span>' + esc(y) + (z.note ? '<br><span class="mut sm">' + esc(z.note) + '</span>' : '') + '</span></li>'; }).join('') + '</ul>' : '') +
      ((c.fixes || []).length ? '<ul class="crit">' + c.fixes.map((f) => '<li><span>' + icon('right', 14) + '</span><span>' + esc(f) + '</span></li>').join('') + '</ul>' : '') +
      '<span class="mut sm">' + (c.by === 'ai' ? 'Проверил ИИ' : c.by === 'mentor' ? 'Проверил наставник' : 'Проверка без ИИ') + '</span></div>';
  }
  h += '<div class="row"><button class="ab pri" data-act="check" data-id="' + s.id + '"' + (busy ? ' disabled' : '') + '>' + icon('check') + (x.check ? 'Проверить ещё раз' : 'Сдать результат') + '</button>' +
    (accepted(x.check) ? '<button class="ab amber" data-act="stage" data-id="' + s.id + '" data-k="regulation">К регламенту ' + icon('right') + '</button>' : '') +
    '<button class="ab ghost sm" data-act="stuck" data-id="' + s.id + '">' + icon('help', 13) + 'Не получается</button></div>';
  if (UI.help['stuck:' + s.id]) {
    const items = [];
    s.questions.forEach((q) => q.help.forEach((y, i) => { if (['instruction', 'skill', 'material', 'example'].includes(y.type)) items.push([q, y, i]); }));
    h += '<div class="help">' + items.slice(0, 4).map((z) => '<div class="hl"><span class="k">' + HELP_LABEL[z[1].type] + '</span><b>' + esc(z[1].title) + '</b>' + rich(z[1].text) +
      (z[1].url ? '<div class="row"><a class="ab sm" href="' + esc(z[1].url) + '" target="_blank" rel="noopener">Открыть ' + icon('ext', 13) + '</a></div>' : '') + '</div>').join('') +
      '<div class="row"><button class="ab sm" data-act="guide" data-id="claude-prompt">' + icon('pointer', 13) + 'Как запустить промпт</button>' + (MODE === 'cloud' ? '<button class="ab sm" data-act="to-mentor" data-id="' + s.id + '">' + icon('mentor', 13) + 'Спросить наставника</button>' : '') + '</div></div>';
  }
  if (x.mentor === 'open') h += '<div class="box blue"><span class="sm">Вопрос у наставника. Ответ придёт в течение 24 часов сюда.</span></div>';
  return h;
};
STAGE.regulation = (s) => {
  const r = regOf(s.id), owners = Array.from(new Set([myName()].concat(teamNames()).concat([r.owner || '']))).filter(Boolean);
  const fld = (k, label, rows) => '<div class="reg"><label for="areg-' + k + '">' + label + '</label>' + (rows ? '<textarea class="ta" id="areg-' + k + '" data-reg="' + s.id + '" data-k="' + k + '" rows="' + rows + '">' + esc(r[k] || '') + '</textarea>' : '<input class="in" id="areg-' + k + '" data-reg="' + s.id + '" data-k="' + k + '" value="' + esc(r[k] || '') + '">') + '</div>';
  return '<p class="mut sm" style="margin:0">' + terms('[[регламент]] — правило работы агента. Мы заполнили его по опыту AICEX. Поправь под себя.') + '</p>' +
    fld('when', 'Когда запускать', 0) + fld('input', 'Что на входе', 2) + fld('output', 'Что на выходе', 2) +
    '<div class="reg"><label for="areg-owner">Кто отвечает</label><select class="sel" id="areg-owner" data-reg="' + s.id + '" data-k="owner">' + owners.map((o) => '<option' + (o === r.owner ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>' +
    fld('check', 'Как проверяем', 2) +
    '<div class="reg"><label>Инструменты</label><div class="row">' + (r.tools || []).map((t) => '<span class="pill">' + esc(t) + '</span>').join('') + '</div></div>' +
    '<button class="ab pri full" data-act="reg-save" data-id="' + s.id + '">' + icon('check') + 'Утвердить регламент</button>';
};
STAGE.hire = (s) => {
  const x = st(s.id);
  if (!x.hired) {
    return '<div class="burst"><div class="medal">' + icon(s.agent ? 'user' : 'folder', 26) + '</div><b class="h2">' + esc(s.agent ? 'Агент «' + s.title + '» готов к работе' : 'Ресепшн готов') + '</b>' +
      '<span class="mut sm">' + (s.agent ? 'Контекст, решения и регламент на месте. Нажми — и агент сядет за свой стол.' : 'Паспорт и подключения сохранены в проект.') + '</span>' +
      '<button class="ab amber" data-act="hire" data-id="' + s.id + '"' + (UI.busy.hire ? ' disabled' : '') + '>' + (UI.busy.hire ? '<span class="spin"></span>Нанимаем…' : s.agent ? 'Нанять агента' : 'Готово') + '</button></div>';
  }
  const next = STEPS[s.index + 1];
  const earned = (x.xpAns ? A.xp.answers : 0) + (x.xpGift ? A.xp.gifts : 0) + (x.xpTask ? A.xp.task : 0) + (x.xpReg ? A.xp.regulation : 0) + (x.boss && x.boss.status === 'done' ? A.xp.boss : 0);
  let h = '<div class="burst"><div class="medal">' + icon(s.agent ? 'user' : 'check', 26) + '</div><div class="big">+' + earned + ' опыта</div><b class="h2">' + esc(s.agent ? 'Агент «' + s.title + '» в офисе' : s.title + ' — готово') + '</b>' +
    '<span class="mut sm">' + (s.agent ? 'Сидит в отделе «' + esc(roomName(s.room)) + '». Нажми на него в офисе — откроется регламент и промпт.' : 'Файлы обновлены в «Проекте».') + '</span>' +
    '<div class="row">' + (s.agent ? '<button class="ab sm" data-act="agent" data-id="' + s.agent + '">' + icon('file', 13) + 'Карточка агента</button>' : '') + '<button class="ab sm" data-act="project">' + icon('folder', 13) + 'Проект</button></div></div>';
  if (s.boss) {
    const b = x.boss || {};
    if (b.status === 'done') h += '<div class="box ok"><b>' + icon('crown', 13) + ' Босс побеждён</b><span class="sm">' + esc(b.proof) + '</span></div>';
    else h += '<div class="box amber"><span class="eb">' + icon('crown', 12) + ' Босс</span><b>' + esc(s.boss.task) + '</b><label class="mut sm" for="aboss">' + esc(s.boss.proof) + '</label><textarea class="ta" id="aboss" rows="3" placeholder="' + esc(s.boss.placeholder || '') + '"></textarea>' +
      '<div class="row"><button class="ab amber" data-act="boss-send" data-id="' + s.id + '">' + icon('check') + 'Победить босса</button><span class="mut sm">Можно позже: босс будет ждать в треке.</span></div></div>';
  }
  h += next ? '<button class="ab pri full" data-act="open-step" data-id="' + next.id + '">Следующее место: ' + esc(next.agent ? '«' + next.title + '»' : next.title) + ' ' + icon('right') + '</button>' : '<button class="ab pri full" data-act="track">Трек пройден — к итогам ' + icon('right') + '</button>';
  return h;
};
