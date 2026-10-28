// Validates track v2 step files against SPEC.md.
// Usage: node src/validate.js src/content-a.js [src/content-b.js]
const fs = require('fs');
const vm = require('vm');

const MAP = {
  '0.1': ['hall', null, 'Паспорт бизнеса и проект в Claude', false, 'context/business.md'],
  '0.2': ['hall', null, 'Подключения: твои сервисы в Claude', false, 'context/tools.md'],
  '1.1': ['ceo', 'market', 'Исследования рынка', false, 'context/market.md'],
  '1.2': ['ceo', 'specs', 'ТЗ и документы', false, null],
  '1.3': ['ceo', 'product', 'Разработка продуктов', false, 'context/offer.md'],
  '2.1': ['marketing', 'audience', 'Анализ аудитории', false, 'context/audience.md'],
  '2.2': ['marketing', 'scripts', 'Сценарии', false, null],
  '2.3': ['marketing', 'avatar', 'Видео с аватаром', false, null],
  '2.4': ['marketing', 'montage', 'Монтаж видео', true, null],
  '2.5': ['marketing', 'carousel', 'Карусели', false, null],
  '2.6': ['marketing', 'publish', 'Публикации', false, null],
  '3.1': ['marketing', 'landings', 'Лендинги', false, null],
  '3.2': ['marketing', 'leadmagnet', 'Лид-магниты', false, null],
  '3.3': ['marketing', 'funnels', 'Воронки', true, null],
  '3.4': ['marketing', 'slides', 'Презентации', false, null],
  '3.5': ['marketing', 'creatives', 'Креативы', false, null],
  '4.1': ['sales', 'comments', 'Ответы на комментарии', false, null],
  '4.2': ['sales', 'chats', 'Переписки', false, null],
  '4.3': ['sales', 'consult', 'ИИ-консультации', false, null],
  '4.4': ['sales', 'mailings', 'Рассылки', false, null],
  '4.5': ['sales', 'closer', 'Закрытие сделок', true, null],
  '5.1': ['traffic', 'metaads', 'Рекламные кампании', true, null],
  '5.2': ['traffic', 'adreports', 'Отчёты по рекламе', false, null],
  '6.1': ['marketing', 'analytics', 'Аналитика', false, null],
  '6.2': ['ceo', 'briefing', 'Утренний брифинг', false, null],
  '6.3': ['ceo', 'skills', 'Скиллы и автоматизации', true, null],
};
const HELP = ['instruction', 'recommendation', 'lecture', 'skill', 'material', 'example', 'template'];
const GIFT = ['skill', 'artifact', 'product', 'connector', 'template'];
const GUIDES = ['claude-new-project', 'claude-instructions', 'claude-knowledge', 'claude-prompt', 'claude-skill-upload', 'claude-connector', 'office-open'];
const CONNECTORS = ['Chat Place', 'HeyGen', 'Higgsfield', 'Invideo', 'Windsor.ai', 'Google Drive', 'Gmail', 'Google Calendar', 'Notion', 'Figma'];
const GLOSSARY = ['скилл', 'агент', 'коннектор', 'проект Claude', 'знания проекта', 'инструкция проекта', 'регламент', 'артефакт', 'промпт', 'контекст', 'бот', 'воронка', 'лид-магнит', 'кодовое слово', 'лендинг', 'рилс', 'карусель', 'креатив', 'директ', 'база знаний', 'босс'];
const real = fs.readFileSync(__dirname + '/../AGENTS-REAL.md', 'utf8');
const URLS = new Set((real.match(/https?:\/\/[^\s>)]+/g) || []).concat([
  'https://transcribe.aicex.club', 'https://aihub.aicex.club', 'https://reels.aicex.club', 'https://montazh.aicex.club', 'https://skills.aicex.club',
  'https://persona-train.aicex.club', 'https://parser.aicex.club', 'https://office.aicex.club', 'https://marketing.aicex.club', 'https://hq.aicex.club'
]).map((u) => u.replace(/[.,;]+$/, '')));

let errors = 0, warns = 0;
const err = (id, m) => { errors++; console.log('ERROR ' + id + ': ' + m); };
const warn = (id, m) => { warns++; console.log('warn  ' + id + ': ' + m); };
const str = (v) => typeof v === 'string' && v.trim().length > 0;
function text(id, where, t) {
  if (typeof t !== 'string') return;
  const re = /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g; let m;
  while ((m = re.exec(t))) if (!GLOSSARY.includes(m[1])) err(id, where + ': unknown glossary key [[' + m[1] + ']]');
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) err(id, where + ': emoji');
  t.split(/(?<=[.!?])\s+/).forEach((s) => { const n = s.replace(/\[\[[^\]]*\]\]/g, 'x').split(/\s+/).filter(Boolean).length; if (n > 26) warn(id, where + ': long sentence (' + n + ' words): ' + s.slice(0, 60) + '…'); });
}
function url(id, where, u) {
  if (!str(u)) return err(id, where + ': url missing');
  if (!/^https:\/\//.test(u)) err(id, where + ': url must be https');
  else if (!URLS.has(u.replace(/\/$/, ''))) warn(id, where + ': url not found in AGENTS-REAL.md / product list: ' + u);
}

for (const file of process.argv.slice(2)) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  const steps = (ctx.window.ACADEMY || {}).steps || [];
  console.log(file + ': ' + steps.length + ' steps');
  for (const s of steps) {
    const id = s.id, ref = MAP[id];
    if (!ref) { err(id, 'unknown step id'); continue; }
    const [room, agent, title, boss, context] = ref;
    if (s.module !== Number(id.split('.')[0])) err(id, 'module mismatch');
    if (s.room !== room) err(id, 'room must be ' + room);
    if ((s.agent || null) !== agent) err(id, 'agent must be ' + agent);
    if (s.title !== title) err(id, 'title must be «' + title + '»');
    if ((s.context || null) !== context) err(id, 'context must be ' + context);
    if (typeof s.minutes !== 'number') err(id, 'minutes missing');
    if (!str(s.brief)) err(id, 'brief missing'); text(id, 'brief', s.brief);
    if (!s.aicex || !str(s.aicex.text) || !Array.isArray(s.aicex.links)) err(id, 'aicex {text, links[]} required');
    else { text(id, 'aicex', s.aicex.text); if (s.aicex.links.length > 3) warn(id, 'aicex: more than 3 links'); s.aicex.links.forEach((l, i) => { if (!str(l.title)) err(id, 'aicex link ' + i + ': title'); url(id, 'aicex link ' + i, l.url); }); }
    const qs = s.questions || [];
    if (qs.length < 2 || qs.length > (id === '0.1' || id === '6.3' ? 5 : 3)) err(id, 'questions: 2–3 (0.1/6.3 up to 5), got ' + qs.length);
    const ids = new Set();
    qs.forEach((q) => {
      const w = 'question ' + q.id;
      if (!/^[a-z][a-z0-9_]*$/.test(q.id || '')) err(id, w + ': id snake_case latin');
      if (ids.has(q.id)) err(id, w + ': duplicate'); ids.add(q.id);
      if (!str(q.label) || !str(q.hint) || !str(q.example) || typeof q.rows !== 'number') err(id, w + ': label, hint, example, rows');
      text(id, w + ' label', q.label); text(id, w + ' example', q.example);
      const help = q.help || [];
      if (help.length < 2 || help.length > 3) err(id, w + ': help 2–3 items');
      if (!help.some((h) => ['skill', 'material', 'template'].includes(h.type))) err(id, w + ': help needs a ready solution (skill/material/template)');
      if (new Set(help.map((h) => h.type)).size !== help.length) warn(id, w + ': help types repeat');
      help.forEach((h, i) => {
        const hw = w + ' help ' + i;
        if (!HELP.includes(h.type)) err(id, hw + ': bad type ' + h.type);
        if (!str(h.title) || !str(h.text)) err(id, hw + ': title, text');
        if (h.type === 'skill' && !str(h.prompt)) err(id, hw + ': skill help needs prompt');
        if (h.type === 'material') url(id, hw, h.url);
        if (h.url && h.type !== 'material') url(id, hw, h.url);
        text(id, hw, h.text);
      });
    });
    if (id === '0.1') ['products', 'clients', 'team'].forEach((k) => { if (!ids.has(k)) err(id, 'question id ' + k + ' required'); });
    if (id === '6.3') { if (s.ownSkill !== true) err(id, 'ownSkill: true'); ['week_plan', 'skill_name', 'skill_when', 'skill_steps'].forEach((k) => { if (!ids.has(k)) err(id, 'question id ' + k + ' required'); }); }
    const gifts = s.gifts || [];
    if (gifts.length < 2 || gifts.length > 4) err(id, 'gifts: 2–4, got ' + gifts.length);
    gifts.forEach((g, i) => {
      const gw = 'gift ' + i + ' (' + g.type + ')';
      if (!GIFT.includes(g.type)) err(id, gw + ': bad type');
      if (!str(g.title) || !str(g.what)) err(id, gw + ': title, what');
      if (g.type === 'skill') { if (!str(g.name)) err(id, gw + ': name'); else if (!real.includes(g.name)) warn(id, gw + ': skill name not in AGENTS-REAL.md: ' + g.name); }
      if (g.type === 'artifact' || g.type === 'product') url(id, gw, g.url);
      if (g.type === 'connector' && !CONNECTORS.includes(g.name)) err(id, gw + ': connector name must be one of ' + CONNECTORS.join(', '));
      if (g.type === 'template' && !str(g.text)) err(id, gw + ': text');
      if (g.guide && !GUIDES.includes(g.guide)) err(id, gw + ': unknown guide ' + g.guide);
    });
    const t = s.task || {};
    if (!str(t.title) || !Array.isArray(t.steps) || t.steps.length < 3 || t.steps.length > 5 || !str(t.prompt) || !str(t.result) || !['text', 'link'].includes(t.resultType) || !Array.isArray(t.check) || t.check.length !== 3) err(id, 'task {title, steps 3–5, prompt, result, resultType text|link, check ×3}');
    else {
      [...t.prompt.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]).forEach((p) => {
        if (p[0] === '@') { if (!['@project', '@name', '@niche'].includes(p)) err(id, 'prompt: bad placeholder {{' + p + '}}'); }
        else if (!ids.has(p)) err(id, 'prompt uses unknown question {{' + p + '}}');
      });
      if (!/\{\{[a-z]/.test(t.prompt)) warn(id, 'prompt does not use any answer');
      t.steps.forEach((x, i) => text(id, 'task step ' + i, x));
    }
    const r = s.regulation || {};
    ['when', 'input', 'output', 'owner', 'check'].forEach((k) => { if (!str(r[k])) err(id, 'regulation.' + k + ' missing'); });
    if (!Array.isArray(r.tools)) err(id, 'regulation.tools[] missing');
    if (boss) { if (!s.boss || !str(s.boss.task) || !str(s.boss.proof) || typeof s.boss.days !== 'number') err(id, 'boss {task, proof, placeholder, days}'); }
    else if (s.boss) err(id, 'boss must be null');
    if (id === '6.3' && s.boss && s.boss.days !== 14) err(id, 'final boss days: 14');
  }
}
console.log(errors ? errors + ' error(s), ' + warns + ' warning(s)' : 'OK, ' + warns + ' warning(s)');
process.exit(errors ? 1 : 0);
