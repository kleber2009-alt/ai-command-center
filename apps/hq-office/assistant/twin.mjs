/* Knowledge of the digital twin (hq2.aicex.club/twin/): who Ilia is, how he writes and how his content
   works. Built from twin-profile.md (facts from the project + sections Ilia fills in) and the rules of
   the team's content skills (.claude/skills: scripts of reels, montage styles, carousels). The deploy
   copies the skills next to the server (twin-skills/); a local run reads them from the repository.
   Plus the twin's own memory of Ilia (DATA_DIR/twin-memory.json): what Ilia told it about his audience,
   tone of voice, content plan and strategy — written by the remember tool, never shipped in the repo.
   Rebuilt when a file changes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = process.env.TWIN_SKILLS || [path.join(HERE, 'twin-skills'), path.resolve(HERE, '../../../.claude/skills')].find(d => fs.existsSync(d)) || '';
const PROFILE = path.join(HERE, 'twin-profile.md');
// [file under the skills dir, title in the prompt]
const SKILL_FILES = [
  ['remake-top-reel/references/script-rules.md', 'Как Илья пишет сценарии рилсов (скилл remake-top-reel)'],
  ['remake-top-reel/references/styles.md', 'Стили монтажа «Студии Кадрика»'],
  ['carousel-pro/references/carousel-rules.md', 'Правила каруселей @ilia.paliy (скилл carousel-pro)'],
];

// sections of the twin's memory: id → title (the first four fill the «(заполняет Илья)» gaps of the profile)
export const SECTIONS = { audience:'Аудитория', tone:'Tone of voice', content_plan:'Контент-план и рубрики', strategy:'Стратегия и цели', facts:'Факты, решения, предпочтения' };
const GAP_OF = { 'Аудитория':'audience', 'Tone of voice':'tone', 'Контент-план и рубрики':'content_plan', 'Стратегия и цели':'strategy' };
let DATA = '';
export function initTwin(dataDir) { DATA = dataDir; }
const memFile = () => DATA ? path.join(DATA, 'twin-memory.json') : '';
export function readMemory() { try { return JSON.parse(fs.readFileSync(memFile(), 'utf8')); } catch { return { sections:{} }; } }
// add a note to a section (or replace the section when Ilia corrects it); keeps each section short
export function remember(section, text, mode = 'add') {
  if (!SECTIONS[section] || !text?.trim() || !memFile()) return null;
  const m = readMemory(), list = mode === 'replace' ? [] : (m.sections[section] || []);
  list.push({ text:text.trim().slice(0, 1200), at:new Date().toISOString() });
  while (list.length > 40 || list.reduce((n, x) => n + x.text.length, 0) > 6000) list.shift();
  m.sections[section] = list;
  const f = memFile(); fs.writeFileSync(f + '.tmp', JSON.stringify(m, null, 1)); fs.renameSync(f + '.tmp', f);
  return list.length;
}

let cache = { key:'', text:'', sources:[] };

// [path on disk, title, path in the repository]
const files = () => [[PROFILE, 'Профиль Ильи', 'apps/hq-office/assistant/twin-profile.md'], ...SKILL_FILES.map(([f, t]) => [SKILLS_DIR ? path.join(SKILLS_DIR, f) : '', t, '.claude/skills/' + f])];

export function loadTwin() {
  const list = files().filter(([f]) => f && fs.existsSync(f));
  const mf = memFile(), memStamp = mf && fs.existsSync(mf) ? fs.statSync(mf).mtimeMs : 0;
  const key = list.map(([f]) => f + ':' + fs.statSync(f).mtimeMs).join('|') + '|' + memStamp;
  if (cache.key === key) return cache;
  const parts = ['# Что двойник знает об Илье и его контенте'];
  const sources = [];
  for (const [f, title, repo] of list) {
    const raw = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    parts.push('', `## ${title}`, raw.replace(/^#\s.*\n/, ''));
    sources.push({ title, file:repo, chars:raw.length });
  }
  // the twin's memory: what Ilia told it himself
  const mem = readMemory().sections || {};
  const filled = Object.keys(SECTIONS).filter(k => mem[k]?.length);
  if (filled.length) {
    parts.push('', '## Что Илья рассказал сам (память двойника, новые записи ниже — они важнее старых)');
    for (const k of filled) parts.push('', `### ${SECTIONS[k]}`, ...mem[k].map(n => '- ' + n.text));
    sources.push({ title:'Память двойника: что Илья рассказал сам', file:'сервер: twin-memory.json', chars:filled.reduce((n, k) => n + mem[k].reduce((a, x) => a + x.text.length, 0), 0) });
  }
  // which profile sections are still empty: the twin says so instead of guessing
  const profile = fs.existsSync(PROFILE) ? fs.readFileSync(PROFILE, 'utf8') : '';
  const empty = profile.split(/^## /m).slice(1).map(s => s.split('\n')).filter(([head, ...rest]) => /\(заполняет Илья\)/.test(head) && !rest.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim())
    .map(([head]) => head.replace(/\s*\(заполняет Илья\)/, '').trim()).filter(t => !mem[GAP_OF[t]]?.length);
  if (empty.length) parts.push('', `Пока не заполнено в профиле: ${empty.join(', ')}. Не выдумывай и не расспрашивай об этом сам — сначала ищи в базе знаний (search_knowledge); вопросы — только если Илья сам попросил интервью.`);
  const profileView = Object.fromEntries(Object.entries(SECTIONS).map(([k, t]) => [k, { title:t, notes:(mem[k] || []).length }]));
  cache = { key, text:parts.join('\n'), sources, empty, profile:profileView };
  return cache;
}

export const TWIN_PROMPT = `Сейчас ты работаешь как «Двойник» — цифровой двойник Ильи и Claude на отдельной странице офиса. Ты знаешь Илью, его проекты, аудиторию, стиль текстов, как устроены его сценарии, карусели, контент-план и стратегия — это блок «Что двойник знает об Илье» ниже, плюс данные офиса и память разговоров.

Как работать в роли двойника:
- Ты партнёр Ильи по контенту и продукту: предлагаешь идеи рилсов и каруселей, пишешь хуки и сценарии его голосом, разбираешь, почему залетело, собираешь план на день и неделю, напоминаешь о воронках и кодовых словах.
- Пишешь тексты в стиле Ильи по правилам из блока знаний: формула сценария, типы хуков, кодовое слово, правила обложки карусели. Чужие цифры и кейсы не выдаёшь за опыт Ильи, новые цифры не выдумываешь.
- Если к сообщению приложен кадр с камеры — ты видишь Илью и комнату. Используй это по делу: свет и ракурс для съёмки, образ, фон, что в кадре мешает. Говори коротко и конкретно («повернись к окну — на лице тень»). Не описывай внешность без повода и не оценивай человека.
- У тебя есть вся база знаний Ильи: реестр всех его проектов и бизнесов, документация каждого продукта, тексты лендингов (офферы, цены), скиллы команды, история задач офиса и его собственные материалы (чаты и проекты из Claude, документы). Сводка — ниже, подробности — инструментами search_knowledge и read_document. Отвечай как человек, который всё это знает: прежде чем сказать «не знаю» или спросить, найди. Если нужного нет и в базе — так и скажи одной фразой.
- Не задавай вопросов, ответ на которые есть в базе, в памяти или в этом разговоре, и никогда не повторяй вопрос, который уже задавал.
- Ты — полноценный Claude Ильи и пульт его Claude Code. Отвечать, думать, писать тексты и сценарии, разбирать картинки и файлы — делаешь сам, прямо в разговоре. Всё, что требует работы с файлами, скиллами, кодом, монтажом, сайтами, презентациями или долгого исследования, — ставь задачей run_claude_code (Claude Code на сервере со всеми скиллами команды) с полным ТЗ из разговора и базы; create_task — если Илья хочет конкретного агента офиса. После постановки коротко скажи, что поставил, и не жди результата в этом ответе.
- Про задачи («что с задачей», «что готово», «что спрашивает исполнитель») — смотри desk_tasks / desk_task и говори по делу, со ссылкой на результат. Отвечать на вопросы исполнителя, принимать, править, отменять — desk_action, только когда Илья сам так сказал.
- Ты учишься на Илье. Когда он рассказывает что-то, что стоит помнить, — об аудитории, своём стиле и словах, рубриках и графике, целях и стратегии, решениях и предпочтениях, — сразу сохрани это инструментом remember (своими словами, кратко и конкретно, его формулировки и примеры — дословно) и коротко подтверди: «запомнил». Если Илья поправляет то, что ты помнишь, — сохрани исправление с mode=replace, переписав раздел целиком.
- Режим интервью — только когда Илья сам просит («проведи интервью», «узнай меня»): сначала изучи базу и память, потом задавай по одному короткому вопросу только о том, чего там нет (ни одного вопроса, на который можно ответить из базы); каждый ответ сохраняй через remember. Не больше 6 вопросов, потом коротко перечисли, что узнал.`;

export const rememberTool = () => ({
  name:'remember', eager_input_streaming:true,
  description:'Сохранить в память двойника то, что Илья рассказал о себе, аудитории, стиле, контенте или планах. Вызывай сразу, как только услышал такое.',
  input_schema:{ type:'object', required:['section', 'text'], properties:{
    section:{ type:'string', enum:Object.keys(SECTIONS), description:'audience — аудитория; tone — tone of voice, слова, примеры текстов; content_plan — рубрики, частота, график, кодовые слова; strategy — цели, продукт в фокусе, цифры; facts — прочие факты, решения, предпочтения.' },
    text:{ type:'string', description:'Что запомнить: кратко, конкретно, формулировки Ильи — дословно.' },
    mode:{ type:'string', enum:['add', 'replace'], description:'add — дописать (по умолчанию); replace — Илья поправил, переписать раздел целиком.' } } },
});
