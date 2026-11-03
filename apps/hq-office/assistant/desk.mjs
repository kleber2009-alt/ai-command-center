/* Working desk of the office — the owner sets tasks for agents: /api/assistant/desk/*.

   The owner writes (or tells the assistant) what is needed. The dispatcher — Claude over the agent
   catalog of the site (who does what, skills, examples) — picks the agent and the skill, writes the
   brief, or asks one question when the result would be wrong without the answer. The runner on the
   server (apps/hq-office/runner, Claude Code with the team's skills, the same login as the bots)
   takes queued tasks, reports steps, uploads the result and either brings it for review or asks.
   The owner looks at the result in the office: «ок» publishes it to the task history, or a revision
   goes back to the same agent and session.

     owner:  PUT upload?name=  · POST tasks {text, agent, uploads} · GET tasks · GET events (SSE)
             POST tasks/<id>/answer {text} · /approve {publish} · /revise {text} · /retry · /cancel
     runner: POST runner/hello · POST runner/claim · GET runner/<id>/input/<name>
             POST runner/<id>/step {text} · PUT runner/<id>/file?path= · POST runner/<id>/finish
     public: GET history.js | history.json (accepted and published tasks, in the format of tasks.js)
             GET files/<id>/v<n>/<path> — the owner always, everyone once published

   Statuses: routing → question | queued → work → review → done, plus cancelled and error.

   Style first: a task on video montage, reels or carousels does not go to the agent until the owner
   picks the style — after the dispatcher, the task stops with a question {from:'style', options}
   (the office shows the options as buttons; a free answer is taken as the style too). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import Anthropic from '@anthropic-ai/sdk';
import { officeWindow, moscowDate } from './office.mjs';

const FILE_LIMIT = 300e6;
const STEPS_KEPT = 80;
const KIND = { slides:'Презентация', document:'Документ', landing:'Сайт', script:'Сценарии', carousel:'Дизайн', video:'Видео', image:'Дизайн', research:'Исследование', other:'Разработка' };
const STATUS = { routing:'диспетчер разбирает', question:'нужен ваш ответ', queued:'в очереди', work:'в работе', review:'на проверке', done:'готово', cancelled:'отменена', error:'ошибка' };
const OPEN = ['routing', 'question', 'queued', 'work', 'review'];
const MIME = { '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.md':'text/markdown; charset=utf-8',
  '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml',
  '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2', '.ttf':'font/ttf', '.zip':'application/zip', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

const ROUTER_PROMPT = `Ты — диспетчер живого офиса агентов AICEX (hq2.aicex.club). Владелец, Илья Палий, ставит задачу своими словами. Ты решаешь, кто из агентов офиса её сделает, каким скиллом, и пишешь агенту ТЗ. Агенты — Claude Code со скиллами команды на сервере: делают презентации, сайты, документы, сценарии, карусели, монтаж видео и т. п. и сдают готовые файлы.

Как решать:
- agent — один агент из каталога ниже, чья это работа. Если владелец сам выбрал агента, оставь его, если задача ему хоть как-то по силам.
- skill — имя скилла этого агента из каталога (например sprint-slides, montazh-rils-kobalt, karusel) или пустая строка, если подходящего нет.
- title — короткое название задачи для доски, до 70 знаков, по-русски.
- brief — ТЗ агенту: что сделать, для кого и зачем, что должно получиться (формат, объём, стиль бренда AICEX), из каких материалов. Подставь разумные значения по умолчанию вместо вопросов.
- deliverable — тип результата.
- why — одной фразой, почему этот агент.
- visual — video, если задача про монтаж, видео, рилс, шортс или ролик; carousel — если про карусель; иначе none.
- style_named — стиль, который владелец УЖЕ явно назвал в задаче или ответах («стекло», «бизнес-рилс», «светлая карусель», «как у Нейта»), иначе пустая строка. Не выбирай стиль за владельца — его спросят отдельно.
- action = ask и question — только если без ответа результат точно выйдет не тем: нет видео для монтажа, неясно, о каком продукте или эфире речь, и т. п. Один конкретный вопрос. Иначе action = assign и question пустой.
Пиши по-русски.`;

/* Styles the owner picks from before a montage / reels / carousel task goes to work. The montage styles are the
   Creator Pack skills of «Студия Кадрика» (.claude/skills/remake-top-reel/references/styles.md) plus the reels
   skills on the runner's server; the carousel styles are the ones of carousel-pro (config.json → styles). */
const STYLE_MENU = {
  video:[
    { label:'Стеклянная объяснялка', skill:'glass-explainer-reel', about:'крупные планы и панель снизу, сверху бизнес-графика на стеклянных карточках, уведомления, счётчики' },
    { label:'Панель-объяснялка', skill:'explainer-panel-reel', about:'та же панель, графика чище: заголовки, нумерованные пункты, схемы — для пошаговых роликов' },
    { label:'Бизнес-рилс', skill:'business-short-form-reels', about:'текстовый хук, ротация «ты на весь экран / сплит / анимация», стеклянные плашки, окна Docs и Notion' },
    { label:'Как у Nate Herk', skill:'reels-herk', about:'сплит, тёмные боксовые титры, логотипы-плитки, 3D-скрины, терминал-карточки' },
    { label:'Промо-история с лицом', skill:'reels-promo-face', about:'кинетический хук, поиск с шайбой, светлый iOS-интерфейс, 3D-эмодзи, кодовое слово' },
  ],
  carousel:[
    { label:'Тёмный @ilia.paliy', skill:'carousel-pro', about:'основной формат: чёрный фон, тёплое свечение, Jost, оранжевый курсив, капсулы' },
    { label:'Светлый @ilia.paliy', skill:'carousel-pro', about:'тёмный текст на светлом фоне, белые карточки, капс-обложка' },
    { label:'Обложка с вашим фото', skill:'carousel-pro', about:'обложка на вашем фото (или образ двойника HeyGen), дальше — тёмный формат' },
  ],
};
const STYLE_ANY = { label:'Выбери сам', skill:'', about:'агент выберет стиль под сценарий' };
// skills that run the whole job and take the montage style as a parameter — the chosen style does not replace them
const ORCHESTRATORS = new Set(['remake-top-reel', 'carousel-pro', 'ilia-carousel-style']);
const STYLE_SKILL_RE = { video:/reel|rils|montazh|montage|монтаж|рилс/i, carousel:/carousel|karusel|карусел/i };

const RULES = `Как работать:
- Сначала проверь, твоя ли это задача и хватает ли материалов. Если задача не по твоему профилю или без ответа владельца результат выйдет не тем — ничего не делай, коротко объясни почему и последней строкой ответа напиши: NEED: <один конкретный вопрос владельцу>.
- Работаешь без окна: ничего не спрашивай по ходу и не жди подтверждений — делай результат целиком, в стиле бренда AICEX, по-русски.
- Память сервера общая с ботами и сайтами, исполнителю дано до 4.5 ГБ. Тяжёлое (рендер видео, Remotion, ffmpeg, браузер) запускай строго по одному: несколько роликов — один за другим, не параллельно; Remotion — с --concurrency=1. Если процесс убит (код 137, Killed) — не хватило памяти: не повторяй то же самое, уменьши нагрузку (по одному ролику, меньше потоков) или сдай то, что уже готово.
- Всё, что сдаёшь, положи в папку out/ — только готовые файлы, без черновиков и исходников. Главный файл для просмотра: для презентации, сайта, документа или текста — out/index.html (одна страница, открывается в браузере, картинки и стили рядом в out/); для видео — out/<имя>.mp4; для картинок — out/<имя>.jpg или .png. Если по скиллу получается PDF или PPTX — положи их в out/ рядом с index.html.
- В конце напиши 2–3 предложения отчёта для владельца: что сделано и что посмотреть. Предпоследней строкой: SUMMARY: <одно предложение для истории офиса — что получилось и зачем, без имён файлов>. Последней строкой: RESULT: out/<главный файл>.`;

export function createDesk({ claude, model, fallback, dataDir, officeDir, runnerToken }) {
  const DIR = path.join(dataDir, 'desk');
  fs.mkdirSync(path.join(DIR, 'uploads'), { recursive:true });
  const STORE = path.join(DIR, 'tasks.json');
  let tasks = [];
  try { tasks = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
  const clients = new Set();
  let runner = { seenAt:0, version:'', claude:null };

  const save = () => { fs.writeFileSync(STORE + '.tmp', JSON.stringify(tasks)); fs.renameSync(STORE + '.tmp', STORE); };
  const now = () => new Date().toISOString();
  const byId = id => tasks.find(t => t.id === id);
  const taskDir = id => path.join(DIR, 'tasks', id);

  /* ---------- the catalog: agents of the office, their skills and example tasks ---------- */

  function catalog() {
    const W = officeWindow(officeDir) || {};
    const CFG = W.OFFICE_CONFIG || { depts:[] }, CAT = W.AGENT_CATALOG || {}, AC = W.AGENT_CONTENT || {};
    const WS = W.OFFICE_WORKS?.skills || {}, EXTRA = W.OFFICE_SKILLS_LIBRARY?.extra || [];
    const agents = [], lines = ['# Агенты офиса (id в скобках)'];
    for (const d of CFG.depts) {
      lines.push('', `## ${d.name}`);
      for (const id of d.agents) {
        const c = AC[id] || {}, seen = new Set();
        const skills = [...(c.skills || []), ...(WS[id] || []), ...EXTRA.filter(s => (s.agents || []).includes(id))]
          .filter(s => s?.name && !seen.has(s.name) && seen.add(s.name));
        const a = { id, name:CAT[id]?.name || id, role:CAT[id]?.role || '', dept:d.id, deptName:d.name, lead:c.lead || '' };
        agents.push(a);
        lines.push(`- ${a.name} (${id}): ${a.role}. ${a.lead}`,
          skills.length ? `  Скиллы: ${skills.map(s => `${s.name} — ${s.title}`).join('; ')}` : '  Скиллы: нет',
          ...(c.templates || []).slice(0, 2).map(x => `  Пример задачи: «${x.prompt}»`));
      }
    }
    return { agents, text:lines.join('\n') };
  }
  // Claude Code itself: the runner with every skill of the team, for tasks the twin sends directly (no dispatcher)
  const CC = { id:'claude-code', name:'Claude Code', role:'универсальный исполнитель: все скиллы команды, код, файлы, интернет', dept:'ceo', deptName:'Штаб', lead:'' };
  const agentOf = id => id === CC.id ? CC : catalog().agents.find(a => a.id === id);

  /* ---------- skills installed on the runner's server (it reports them on start) ---------- */
  const SKILLS_FILE = path.join(DIR, 'skills.json');
  let serverSkills = [];
  try { serverSkills = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8')); } catch {}

  /* ---------- views and events ---------- */

  const fileUrl = (t, p) => `/api/assistant/desk/files/${t.id}/v${t.result.version}/${p.split('/').map(encodeURIComponent).join('/')}`;
  function view(t) {
    const a = t.route ? agentOf(t.route.agent) : t.agent ? agentOf(t.agent) : null;
    const waiting = tasks.filter(x => x.status === 'queued').sort((x, y) => x.queuedAt.localeCompare(y.queuedAt));
    return {
      id:t.id, created:t.created, updated:t.updated, text:t.text, files:t.files.map(f => f.name), askedAgent:t.agent || '',
      status:t.status, statusText:STATUS[t.status] || t.status, queuePos:t.status === 'queued' ? waiting.indexOf(t) + 1 : 0,
      agent:a ? { id:a.id, name:a.name, dept:a.dept } : null, route:t.route || null, question:t.question || null, style:t.style?.label || '', answers:t.answers,
      steps:t.steps.slice(-40), error:t.error || '', log:t.status === 'error' ? t.log || '' : '', published:Boolean(t.published), versions:t.versions || 0,
      result:t.result ? { version:t.result.version, summary:t.result.summary, note:t.result.note || '', main:t.result.main, mainUrl:t.result.main ? fileUrl(t, t.result.main) : '',
        files:t.result.files.map(f => ({ path:f.path, size:f.size, url:fileUrl(t, f.path) })) } : null,
    };
  }
  function emit(t) {
    t.updated = now(); save();
    const line = `data: ${JSON.stringify({ t:'task', task:view(t) })}\n\n`;
    for (const res of clients) res.write(line);
  }
  function step(t, text) {
    t.steps.push({ at:now(), text:String(text).slice(0, 300) });
    if (t.steps.length > STEPS_KEPT) t.steps.splice(0, t.steps.length - STEPS_KEPT);
  }
  const runnerView = () => ({ online:Date.now() - runner.seenAt < 90e3, seenAt:runner.seenAt ? new Date(runner.seenAt).toISOString() : '', claude:runner.claude });
  // keeps the stream open through proxies and tells the office whether the runner is alive
  setInterval(() => { const line = `data: ${JSON.stringify({ t:'runner', runner:runnerView() })}\n\n`; for (const res of clients) res.write(line); }, 25e3).unref();
  // uploads of a form that was never sent
  const sweep = () => {
    const root = path.join(DIR, 'uploads');
    for (const d of fs.readdirSync(root)) try { if (Date.now() - fs.statSync(path.join(root, d)).mtimeMs > 864e5) fs.rmSync(path.join(root, d), { recursive:true, force:true }); } catch {}
  };
  sweep(); setInterval(sweep, 3600e3).unref();

  /* ---------- the dispatcher ---------- */

  async function route(t) {
    if (!claude) { t.status = 'error'; t.error = 'Диспетчер не подключён к Claude (нет ключа).'; return emit(t); }
    const cat = catalog(), ids = cat.agents.map(a => a.id);
    const asked = t.agent && ids.includes(t.agent) ? agentOf(t.agent) : null;
    const request = [`Просьба владельца: «${t.text}»`,
      asked ? `Владелец сам выбрал агента: ${asked.name} (${asked.id}).` : 'Агента владелец не выбирал — выбери сам.',
      `Материалы от владельца: ${t.files.length ? t.files.map(f => f.name).join(', ') : 'нет'}.`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ владельца: ${x.a}`)].join('\n');
    const schema = { type:'object', additionalProperties:false, required:['action', 'agent', 'skill', 'title', 'brief', 'deliverable', 'why', 'question', 'visual', 'style_named'], properties:{
      visual:{ type:'string', enum:['video', 'carousel', 'none'] }, style_named:{ type:'string' },
      action:{ type:'string', enum:['assign', 'ask'] }, agent:{ type:'string', enum:ids }, skill:{ type:'string' }, title:{ type:'string' }, brief:{ type:'string' },
      deliverable:{ type:'string', enum:Object.keys(KIND) }, why:{ type:'string' }, question:{ type:'string' } } };
    try {
      const msg = await claude.beta.messages.create({
        model, max_tokens:16000, ...fallback, output_config:{ effort:'low', format:{ type:'json_schema', schema } },
        system:[{ type:'text', text:ROUTER_PROMPT }, { type:'text', text:cat.text, cache_control:{ type:'ephemeral' } }],
        messages:[{ role:'user', content:request }],
      });
      if (msg.stop_reason !== 'end_turn') throw new Error('stop_reason ' + msg.stop_reason);
      const r = JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''));
      if (!ids.includes(r.agent)) throw new Error('unknown agent ' + r.agent);
      const a = agentOf(r.agent);
      t.route = { agent:a.id, skill:String(r.skill || '').trim(), title:String(r.title || t.text).slice(0, 90), brief:String(r.brief || ''), deliverable:KIND[r.deliverable] ? r.deliverable : 'other', why:String(r.why || ''),
        visual:visualOf(r), style:t.style || null };
      const named = String(r.style_named || '').trim();
      if (t.route.visual && !t.style && named) t.style = pickStyle(t.route.visual, named) || { label:named.slice(0, 120), skill:'', about:'' };
      if (t.style) applyStyle(t);
      if (r.action === 'ask' && String(r.question || '').trim()) {
        t.status = 'question'; t.question = { from:'dispatcher', text:r.question.trim() };
        step(t, `Диспетчер: задачу возьмёт «${a.name}», но сначала нужен ответ — ${r.question.trim()}`);
      } else if (t.route.visual && !t.style) {
        // montage, reels and carousels: the owner picks the style before the agent starts
        const options = styleOptions(t.route.visual);
        t.status = 'question';
        t.question = { from:'style', text:t.route.visual === 'carousel' ? 'В каком стиле сделать карусель?' : 'В каком стиле смонтировать ролик?', options };
        step(t, `Диспетчер: задачу возьмёт «${a.name}». Сначала выберите стиль — ${options.map(o => o.label).join(', ')}.`);
      } else {
        queue(t, { kind:'run' });
        step(t, `Диспетчер передал задачу агенту «${a.name}»${t.route.skill ? ` · скилл ${t.route.skill}` : ''}${t.style ? ` · стиль «${t.style.label}»` : ''}. ${t.route.why}`);
      }
    } catch (e) {
      console.error('desk route:', e.message);
      t.status = 'error';
      t.error = e instanceof Anthropic.APIError ? `Диспетчер: Claude ответил ошибкой${e.status ? ' ' + e.status : ''} — поставьте задачу ещё раз.` : 'Диспетчер не смог разобрать задачу — поставьте её ещё раз.';
    }
    emit(t);
  }
  /* ---------- the style question ---------- */

  const visualOf = r => r.visual === 'video' || r.visual === 'carousel' ? r.visual
    : r.deliverable === 'video' ? 'video' : r.deliverable === 'carousel' && STYLE_SKILL_RE.carousel.test(String(r.skill || '') + ' ' + String(r.title || '')) ? 'carousel' : '';
  function styleOptions(visual) {
    const list = [...STYLE_MENU[visual]], have = new Set(list.map(o => o.skill));
    // the rest of the montage / carousel skills installed on the runner's server
    for (const x of serverSkills) {
      if (list.length >= 8) break;
      if (have.has(x.name) || ORCHESTRATORS.has(x.name) || !STYLE_SKILL_RE[visual].test(x.name + ' ' + x.description.slice(0, 120))) continue;
      if (visual === 'video' && /long|dlinn|youtube/i.test(x.name)) continue;
      have.add(x.name);
      list.push({ label:x.name, skill:x.name, about:x.description.replace(/\s+/g, ' ').slice(0, 140) });
    }
    return [...list, STYLE_ANY].map((o, i) => ({ id:String(i + 1), ...o }));
  }
  // the owner's answer: a button (its label), its number, or own words
  function pickStyle(visual, text) {
    const s = String(text).trim().toLowerCase().replace(/[«»"]/g, ''), opts = styleOptions(visual);
    return opts.find(o => o.id === s || o.label.toLowerCase() === s || o.skill && o.skill === s)
      || opts.find(o => o.label !== STYLE_ANY.label && s.includes(o.label.toLowerCase()))
      || (/(стекл|glass)/.test(s) && opts.find(o => o.skill === 'glass-explainer-reel'))
      || (/(панел|panel)/.test(s) && opts.find(o => o.skill === 'explainer-panel-reel'))
      || (/(бизнес|business)/.test(s) && opts.find(o => o.skill === 'business-short-form-reels'))
      || (/(нейт|herk)/.test(s) && opts.find(o => o.skill === 'reels-herk'))
      || (/(тёмн|темн|dark)/.test(s) && opts.find(o => o.label.startsWith('Тёмный')))
      || (/(светл|light)/.test(s) && opts.find(o => o.label.startsWith('Светлый')))
      || (/фото/.test(s) && visual === 'carousel' && opts.find(o => o.label.startsWith('Обложка')))
      || (/^(выбери сам|сам|сами|любой|без разницы|на твой|на ваш|на усмотрение)/.test(s) && opts.find(o => o.label === STYLE_ANY.label))
      || null;
  }
  // the chosen style goes to the route: a style skill replaces a plain skill, an orchestrator (remake, carousel) keeps its own
  function applyStyle(t) {
    t.route.style = t.style;
    if (t.style.skill && !ORCHESTRATORS.has(t.route.skill)) t.route.skill = t.style.skill;
  }
  function answerTask(t, text) {
    t.answers.push({ q:t.question.text, a:text });
    if (t.question.from === 'style') {
      t.style = pickStyle(t.route.visual, text) || { label:text.slice(0, 120), skill:'', about:'' };
      applyStyle(t);
      queue(t, { kind:'run' });
      step(t, `Стиль: «${t.style.label}». Диспетчер передал задачу агенту «${agentOf(t.route.agent)?.name}»${t.route.skill ? ` · скилл ${t.route.skill}` : ''}.`);
      emit(t);
    } else if (t.question.from === 'agent') { queue(t, { kind:'answer', text }); step(t, `Ваш ответ: ${text}`); emit(t); }
    else { t.status = 'routing'; t.question = null; step(t, `Ваш ответ: ${text}`); emit(t); route(t); }
  }
  const styleLine = t => {
    const s = t.style || t.route?.style;
    if (!s) return '';
    if (s.label === STYLE_ANY.label) return 'Стиль: владелец оставил выбор тебе — выбери подходящий под сценарий и назови его в отчёте.';
    return `Стиль, который выбрал владелец: «${s.label}»${s.about ? ` (${s.about})` : ''}${s.skill && s.skill !== t.route.skill ? `. Для монтажа вызови скилл ${s.skill} инструментом Skill` : ''}. Делай строго в этом стиле, не спрашивай его заново и не меняй на ротацию.`;
  };

  function queue(t, pending) {
    t.status = 'queued'; t.pending = pending; t.queuedAt = now(); t.question = null;
  }
  // a task «in work» that the runner is no longer doing (it restarted, or lost us while this server
  // restarted): back to the queue once, an error the second time
  function orphan(t, why) {
    t.lost = (t.lost || 0) + 1;
    if (t.lost > 1) { t.status = 'error'; t.error = 'Исполнитель дважды перезапускался посреди задачи и не закончил её — нажмите «Повторить». Если задача тяжёлая (несколько видео), лучше разбить её на части.'; step(t, t.error); }
    else { queue(t, t.pending || { kind:'run' }); step(t, why); }
    emit(t);
  }

  /* ---------- prompts for the runner ---------- */

  function jobPrompt(t) {
    const a = agentOf(t.route.agent), p = t.pending;
    if (p.kind === 'run' && a.id === CC.id) return [`Ты — Claude Code на сервере офиса AICEX: универсальный исполнитель Ильи Палия. Задачу поставил сам Илья через своего цифрового двойника (hq2.aicex.club).`,
      '', `Задача: ${t.route.title}`, `Слова Ильи: «${t.text}»`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ: ${x.a}`),
      styleLine(t),
      `У тебя все скиллы команды (${serverSkills.length || 'список'} в ~/.claude/skills) — сам выбери подходящие и вызывай их инструментом Skill; без подходящего делай сам.`,
      `Материалы от Ильи: ${t.files.length ? t.files.map(f => 'in/' + f.name).join(', ') : 'нет'}.`,
      'Если результат — ответ, исследование, план или текст, оформи его страницей out/index.html (аккуратно, по-русски) и коротко перескажи суть в отчёте.', '', RULES].filter((x, i, a) => x || a[i - 1]).join('\n');
    if (p.kind === 'revise') return `Владелец посмотрел результат и просит правку: «${p.text}»\n\nВнеси правку в файлы out/ (главный файл — тот же), коротко скажи, что изменил. Правила те же: если суть результата изменилась — строка SUMMARY: <одно предложение для истории офиса>; последней строкой RESULT: out/<главный файл>, или NEED: <вопрос>, если без ответа владельца правку не сделать.`;
    if (p.kind === 'answer') return `Ответ владельца на твой вопрос: «${p.text}»\n\nПродолжай задачу по тем же правилам: предпоследней строкой SUMMARY: <одно предложение для истории офиса>, последней строкой RESULT: out/<главный файл>, или NEED: <вопрос>, если всё ещё не хватает.`;
    return [`Ты — агент «${a.name}» (${a.role}) живого офиса AICEX, отдел «${a.deptName}». Задачу поставил владелец, Илья Палий, прямо в офисе hq2.aicex.club.`,
      '', `Задача: ${t.route.title}`, `Слова владельца: «${t.text}»`, `ТЗ от диспетчера: ${t.route.brief}`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ: ${x.a}`),
      t.route.skill ? `Скилл: ${t.route.skill} — вызови его инструментом Skill и работай по нему.` : 'Если среди твоих скиллов есть подходящий — работай по нему.',
      styleLine(t),
      `Материалы от владельца: ${t.files.length ? t.files.map(f => 'in/' + f.name).join(', ') : 'нет'}.`, '', RULES].filter((x, i, a) => x || a[i - 1]).join('\n');
  }

  /* ---------- files ---------- */

  const safeName = n => path.basename(String(n || 'file')).replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 120) || 'file';
  function safeRel(p) {
    const rel = path.posix.normalize(String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^out\//, ''));
    if (!rel || rel === '.' || rel.startsWith('..') || rel.split('/').some(x => x.startsWith('.'))) return '';
    return rel;
  }
  async function saveBody(req, file) {
    fs.mkdirSync(path.dirname(file), { recursive:true });
    let size = 0;
    const cap = new Transform({ transform(chunk, enc, cb) { size += chunk.length; cb(size > FILE_LIMIT ? Object.assign(new Error('too large'), { code:413 }) : null, chunk); } });
    try { await pipeline(req, cap, fs.createWriteStream(file)); } catch (e) { fs.rmSync(file, { force:true }); throw e; }
    return size;
  }
  function sendFile(req, res, file) {
    let st;
    try { st = fs.statSync(file); } catch { return notFound(res); }
    if (!st.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    const head = { 'content-type':type, 'cache-control':'private, no-cache', 'accept-ranges':'bytes', 'x-content-type-options':'nosniff' };
    // results are pages written by an agent: an opaque origin, so they cannot act as the owner on this site
    if (ext === '.html' || ext === '.htm' || ext === '.svg') head['content-security-policy'] = 'sandbox allow-scripts allow-popups allow-forms allow-downloads';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : st.size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      start = Math.max(0, start); end = Math.min(end, st.size - 1);
      if (start > end) { res.writeHead(416, { 'content-range':`bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'content-range':`bytes ${start}-${end}/${st.size}`, 'content-length':end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'content-length':st.size });
    fs.createReadStream(file).pipe(res);
  }
  const notFound = res => json(res, 404, { error:'Не найдено.' });
  const json = (res, code, body) => { res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(body)); };
  async function readJson(req) {
    const parts = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 64e3) throw Object.assign(new Error('too large'), { code:413 }); parts.push(c); }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { return {}; }
  }

  /* ---------- history: what the owner accepted ---------- */

  function historyTask(t) {
    const a = agentOf(t.route.agent), main = t.result.main, url = main ? fileUrl(t, main) : '';
    const ext = path.extname(main || '').toLowerCase(), title = t.route.title;
    const media = !url ? [] : ext === '.mp4' || ext === '.webm' ? [{ type:'video', src:url, title, poster:'' }]
      : ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? [{ type:'img', src:url, title }]
      : ext === '.html' ? [{ type:'page', src:url, title }] : [];
    return { id:'desk-' + t.id, date:moscowDate(new Date(t.doneAt)), dateNote:'задачу поставили и приняли прямо в офисе', kind:KIND[t.route.deliverable] || 'Разработка',
      dept:a?.dept || 'ceo', people:['ilia'], agents:[t.route.agent], title, summary:t.result.history || t.result.summary || '',
      proof:[{ kind:'file', label:`Результат агента «${a?.name || t.route.agent}»`, url }], media, desk:true };
  }

  /* ---------- create, used by the routes and by the assistant's tool ---------- */

  function createTask({ text, agent = '', uploads = [], direct = false, title = '' }) {
    const t = { id:crypto.randomBytes(4).toString('hex'), created:now(), updated:now(), text:String(text).trim().slice(0, 4000), agent:String(agent || ''),
      files:[], status:'routing', answers:[], steps:[], route:null, question:null, result:null, versions:0, published:false };
    for (const u of uploads.slice(0, 20)) {
      const src = path.join(DIR, 'uploads', safeName(u));
      if (!fs.existsSync(src)) continue;
      const name = fs.readdirSync(src)[0];
      if (!name) continue;
      fs.mkdirSync(path.join(taskDir(t.id), 'in'), { recursive:true });
      fs.renameSync(path.join(src, name), path.join(taskDir(t.id), 'in', name));
      fs.rmSync(src, { recursive:true, force:true });
      t.files.push({ name, size:fs.statSync(path.join(taskDir(t.id), 'in', name)).size });
    }
    tasks.unshift(t);
    if (direct) {
      t.route = { agent:CC.id, skill:'', title:String(title || t.text).trim().slice(0, 90), brief:t.text, deliverable:'other', why:'прямая задача Claude Code от двойника' };
      queue(t, { kind:'run' });
      step(t, 'Задача ушла напрямую Claude Code — со всеми скиллами команды.');
      emit(t);
      return { task:t, routed:Promise.resolve() };
    }
    step(t, 'Задача поставлена — диспетчер разбирает, кому её отдать.');
    emit(t);
    return { task:t, routed:route(t) };
  }

  // the same actions the owner has in the office, for the twin's tool
  function act(id, action, text = '') {
    const t = byId(id); text = String(text || '').trim().slice(0, 4000);
    if (!t) return { error:'Нет такой задачи.' };
    if (action === 'answer') {
      if (t.status !== 'question' || !text) return { error:'Сейчас у задачи нет вопроса (или пустой ответ).' };
      answerTask(t, text);
    } else if (action === 'revise') {
      if (!['review', 'done'].includes(t.status) || !text) return { error:'Правку можно дать только к готовому результату и с текстом правки.' };
      queue(t, { kind:'revise', text }); t.published = false; step(t, `Правка: ${text}`); emit(t);
    } else if (action === 'approve') {
      if (t.status !== 'review') return { error:'Принять можно только результат на проверке.' };
      t.status = 'done'; t.doneAt = now(); t.published = true; step(t, 'Принято — задача добавлена в историю офиса.'); emit(t);
    } else if (action === 'retry') {
      if (t.status !== 'error') return { error:'Повторить можно только задачу с ошибкой.' };
      t.error = ''; t.lost = 0;
      if (t.route) { queue(t, t.pending || { kind:'run' }); step(t, 'Повтор — задача снова в очереди.'); emit(t); }
      else { t.status = 'routing'; step(t, 'Повтор — диспетчер разбирает задачу заново.'); emit(t); route(t); }
    } else if (action === 'cancel') {
      if (!OPEN.includes(t.status)) return { error:'Задача уже закрыта.' };
      t.status = 'cancelled'; t.pending = null; step(t, 'Задача отменена.'); emit(t);
    } else return { error:'Неизвестное действие.' };
    return { task:view(t) };
  }

  // a short status block for the assistant: what is on the desk right now
  function summary() {
    const open = tasks.filter(t => OPEN.includes(t.status)).slice(0, 8);
    if (!open.length) return 'Задач в работе у агентов сейчас нет.';
    return 'Задачи на рабочем столе офиса: ' + open.map(t => `«${t.route?.title || t.text.slice(0, 60)}» — ${t.route ? (agentOf(t.route.agent)?.name || '') + ', ' : ''}${STATUS[t.status]}${t.question ? ` (вопрос: ${t.question.text}${t.question.options ? ' Варианты: ' + t.question.options.map(o => o.label).join(', ') : ''})` : ''}`).join('; ') + '.';
  }

  // restart: interrupted routing is redone
  for (const t of tasks) if (t.status === 'routing') route(t);

  /* ---------- routes ---------- */

  async function handle(req, res, rest, isOwner) {
    const seg = rest.split('/').filter(Boolean), M = req.method;
    const url = new URL(req.url, 'http://x');

    if (M === 'GET' && (rest === 'history.js' || rest === 'history.json')) {
      const list = tasks.filter(t => t.status === 'done' && t.published && t.result).map(historyTask);
      if (rest === 'history.json') return json(res, 200, list);
      res.writeHead(200, { 'content-type':'text/javascript; charset=utf-8', 'cache-control':'no-cache' });
      return res.end(`window.OFFICE_TASKS_DESK = ${JSON.stringify(list)};\n`);
    }
    if (M === 'GET' && seg[0] === 'files' && seg.length >= 4) {
      const t = byId(seg[1]), v = Number(String(seg[2]).replace(/^v/, ''));
      if (!t || !t.result) return notFound(res);
      if (!isOwner && !(t.published && v === t.result.version)) return notFound(res);
      const rel = safeRel(seg.slice(3).map(decodeURIComponent).join('/'));
      if (!rel) return notFound(res);
      return sendFile(req, res, path.join(taskDir(t.id), 'v' + v, rel));
    }

    /* runner: Bearer token shared with apps/hq-office/runner */
    if (seg[0] === 'runner') {
      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!runnerToken || auth.length !== runnerToken.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(runnerToken))) return json(res, 403, { error:'runner token' });
      runner.seenAt = Date.now();
      if (M === 'POST' && seg[1] === 'hello') {
        // a (re)started runner has no running jobs: what it was doing goes back to the queue
        const b = await readJson(req); runner.version = String(b.version || '');
        const c = b.claude && typeof b.claude === 'object' ? b.claude : null;
        runner.claude = c ? { ok:Boolean(c.ok), error:String(c.error || '').slice(0, 300), auth:String(c.auth || '').slice(0, 80) } : null;
        for (const t of tasks) if (t.status === 'work') orphan(t, 'Исполнитель перезапустился посреди задачи (выкладка или сбой сервера) — задача снова в очереди.');
        return json(res, 200, { ok:true });
      }
      if (M === 'POST' && seg[1] === 'skills') {
        // every skill installed on the runner's server: name, description and the SKILL.md text (for the twin)
        const parts = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 12e6) return json(res, 413, { error:'too large' }); parts.push(c); }
        let b; try { b = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return json(res, 400, { error:'json' }); }
        serverSkills = (Array.isArray(b.skills) ? b.skills : []).filter(x => x && x.name).slice(0, 500)
          .map(x => ({ name:String(x.name).slice(0, 80), description:String(x.description || '').slice(0, 600), text:String(x.text || '').slice(0, 20000) }));
        fs.writeFileSync(SKILLS_FILE + '.tmp', JSON.stringify(serverSkills)); fs.renameSync(SKILLS_FILE + '.tmp', SKILLS_FILE);
        return json(res, 200, { ok:true, skills:serverSkills.length });
      }
      if (M === 'POST' && seg[1] === 'claim') {
        // the runner does one task at a time: when it asks for the next one, nothing is in work
        for (const t of tasks) if (t.status === 'work') orphan(t, 'Исполнитель не сдал задачу — она снова в очереди.');
        const t = tasks.filter(x => x.status === 'queued').sort((x, y) => x.queuedAt.localeCompare(y.queuedAt))[0];
        if (!t) { res.writeHead(204); return res.end(); }
        const a = agentOf(t.route.agent);
        t.status = 'work'; t.versions = (t.versions || 0) + 1; t.workVersion = t.versions; t.error = '';
        step(t, t.pending.kind === 'revise' ? `«${a?.name}» вносит правку.` : t.pending.kind === 'answer' ? `«${a?.name}» получил ваш ответ и продолжает.` : `«${a?.name}» взял задачу в работу.`);
        emit(t);
        return json(res, 200, { id:t.id, kind:t.pending.kind, version:t.versions, agent:t.route.agent, skill:t.route.skill, title:t.route.title,
          prompt:jobPrompt(t), session:t.pending.kind === 'run' ? '' : t.session || '', files:t.files.map(f => f.name) });
      }
      const t = byId(seg[1]);
      if (!t) return notFound(res);
      if (M === 'GET' && seg[2] === 'input' && seg[3]) return sendFile(req, res, path.join(taskDir(t.id), 'in', safeName(decodeURIComponent(seg[3]))));
      if (M === 'POST' && seg[2] === 'step') {
        const b = await readJson(req);
        if (t.status === 'work' && b.text) { step(t, b.text); emit(t); }
        return json(res, 200, { cancelled:t.status !== 'work' });
      }
      if (M === 'PUT' && seg[2] === 'file') {
        const rel = safeRel(url.searchParams.get('path'));
        if (!rel || t.status !== 'work') return json(res, 400, { error:'path' });
        const size = await saveBody(req, path.join(taskDir(t.id), 'v' + t.workVersion, rel));
        return json(res, 200, { ok:true, size });
      }
      if (M === 'POST' && seg[2] === 'finish') {
        const b = await readJson(req);
        if (t.status !== 'work') return json(res, 200, { ok:true, ignored:true });
        if (b.session) t.session = String(b.session);
        t.lost = 0;
        if (b.result === 'review') {
          const root = path.join(taskDir(t.id), 'v' + t.workVersion), files = [];
          const walk = (d, pre) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes:true }) : []) { const rel = pre ? pre + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), rel); else files.push({ path:rel, size:fs.statSync(path.join(d, e.name)).size }); } };
          walk(root, '');
          const main = safeRel(b.main) && files.some(f => f.path === safeRel(b.main)) ? safeRel(b.main)
            : (files.find(f => f.path === 'index.html') || files.find(f => /\.(mp4|html|pdf|png|jpe?g)$/i.test(f.path)) || files[0])?.path || '';
          if (!files.length) { t.status = 'error'; t.error = 'Агент закончил, но не сдал ни одного файла.'; step(t, t.error); emit(t); return json(res, 200, { ok:true }); }
          // a revision keeps what the work is about; its own report goes to the note
          const before = t.result, revised = t.pending?.kind === 'revise' && before;
          t.result = { version:t.workVersion, main, files, summary:String((revised && before.summary) || b.summary || '').slice(0, 1200),
            note:revised ? String(b.summary || '').slice(0, 1200) : '', history:String(b.history || before?.history || '').slice(0, 400) };
          t.status = 'review'; t.pending = null;
          step(t, `Готово превью: ${main}. Агент несёт результат к вашему столу.`);
        } else if (b.result === 'need') {
          t.status = 'question'; t.question = { from:'agent', text:String(b.question || 'Агенту не хватает данных — уточните задачу.').slice(0, 800) };
          step(t, `«${agentOf(t.route.agent)?.name}» спрашивает: ${t.question.text}`);
        } else {
          t.status = 'error'; t.error = String(b.error || 'Агент не смог закончить задачу.').slice(0, 800); t.log = String(b.log || '').slice(-2000);
          step(t, t.error);
        }
        emit(t);
        return json(res, 200, { ok:true });
      }
      return notFound(res);
    }

    /* owner */
    if (!isOwner) return json(res, 403, { error:'Ставить задачи агентам может только владелец — войдите в ассистенте.' });
    if (M === 'GET' && rest === 'tasks') return json(res, 200, { tasks:tasks.slice(0, 60).map(view), runner:runnerView(), agents:catalog().agents.map(a => ({ id:a.id, name:a.name, dept:a.dept, role:a.role })) });
    if (M === 'GET' && rest === 'events') {
      res.writeHead(200, { 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-store', 'x-accel-buffering':'no' });
      res.write(`data: ${JSON.stringify({ t:'snapshot', tasks:tasks.slice(0, 60).map(view), runner:runnerView() })}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (M === 'PUT' && rest === 'upload') {
      const id = crypto.randomBytes(8).toString('hex'), name = safeName(url.searchParams.get('name'));
      const size = await saveBody(req, path.join(DIR, 'uploads', id, name));
      return json(res, 200, { id, name, size });
    }
    if (M === 'POST' && rest === 'tasks') {
      const b = await readJson(req);
      if (!String(b.text || '').trim()) return json(res, 400, { error:'Опишите задачу.' });
      const { task } = createTask({ text:b.text, agent:b.agent, uploads:Array.isArray(b.uploads) ? b.uploads : [] });
      return json(res, 200, { task:view(task) });
    }
    if (seg[0] === 'tasks' && seg[1] && M === 'POST') {
      const t = byId(seg[1]);
      if (!t) return notFound(res);
      const b = await readJson(req), text = String(b.text || '').trim().slice(0, 4000);
      if (seg[2] === 'answer') {
        if (t.status !== 'question' || !text) return json(res, 400, { error:'Сейчас вопроса нет.' });
        answerTask(t, text);
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'revise') {
        if (!['review', 'done'].includes(t.status) || !text) return json(res, 400, { error:'Правку можно дать к готовому результату.' });
        queue(t, { kind:'revise', text }); t.published = false; step(t, `Правка: ${text}`); emit(t);
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'approve') {
        if (t.status !== 'review') return json(res, 400, { error:'Принять можно результат на проверке.' });
        t.status = 'done'; t.doneAt = now(); t.published = b.publish !== false;
        step(t, t.published ? 'Принято — задача добавлена в историю офиса.' : 'Принято без публикации в истории.');
        emit(t);
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'retry') {
        if (t.status !== 'error') return json(res, 400, { error:'Повторить можно задачу, которая закончилась ошибкой.' });
        t.error = ''; t.lost = 0;
        if (t.route) { queue(t, t.pending || { kind:'run' }); step(t, 'Повтор — задача снова в очереди.'); emit(t); }
        else { t.status = 'routing'; step(t, 'Повтор — диспетчер разбирает задачу заново.'); emit(t); route(t); }
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'cancel') {
        if (!OPEN.includes(t.status)) return json(res, 400, { error:'Задача уже закрыта.' });
        t.status = 'cancelled'; t.pending = null; step(t, 'Задача отменена.'); emit(t);
        return json(res, 200, { task:view(t) });
      }
    }
    return notFound(res);
  }

  return { handle, createTask, summary, agents:() => catalog().agents, view, act,
    list:(n = 15) => tasks.slice(0, n).map(view), get:id => { const t = byId(id); return t ? view(t) : null; },
    skills:() => serverSkills, skillsFile:SKILLS_FILE };
}
