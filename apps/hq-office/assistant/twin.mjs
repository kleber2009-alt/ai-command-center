/* Knowledge of the digital twin (hq2.aicex.club/twin/): who Ilia is, how he writes and how his content
   works. Built from twin-profile.md (facts from the project + sections Ilia fills in) and the rules of
   the team's content skills (.claude/skills: scripts of reels, montage styles, carousels). The deploy
   copies the skills next to the server (twin-skills/); a local run reads them from the repository.
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

let cache = { key:'', text:'', sources:[] };

// [path on disk, title, path in the repository]
const files = () => [[PROFILE, 'Профиль Ильи', 'apps/hq-office/assistant/twin-profile.md'], ...SKILL_FILES.map(([f, t]) => [SKILLS_DIR ? path.join(SKILLS_DIR, f) : '', t, '.claude/skills/' + f])];

export function loadTwin() {
  const list = files().filter(([f]) => f && fs.existsSync(f));
  const key = list.map(([f]) => f + ':' + fs.statSync(f).mtimeMs).join('|');
  if (cache.key === key) return cache;
  const parts = ['# Что двойник знает об Илье и его контенте'];
  const sources = [];
  for (const [f, title, repo] of list) {
    const raw = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    parts.push('', `## ${title}`, raw.replace(/^#\s.*\n/, ''));
    sources.push({ title, file:repo, chars:raw.length });
  }
  // which profile sections are still empty: the twin says so instead of guessing
  const profile = fs.existsSync(PROFILE) ? fs.readFileSync(PROFILE, 'utf8') : '';
  const empty = profile.split(/^## /m).slice(1).map(s => s.split('\n')).filter(([head, ...rest]) => /\(заполняет Илья\)/.test(head) && !rest.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim())
    .map(([head]) => head.replace(/\s*\(заполняет Илья\)/, '').trim());
  if (empty.length) parts.push('', `Пока не заполнено в профиле: ${empty.join(', ')}. Об этом не выдумывай — скажи, что ещё не знаешь, и предложи Илье рассказать.`);
  cache = { key, text:parts.join('\n'), sources, empty };
  return cache;
}

export const TWIN_PROMPT = `Сейчас ты работаешь как «Двойник» — цифровой двойник Ильи и Claude на отдельной странице офиса. Ты знаешь Илью, его проекты, аудиторию, стиль текстов, как устроены его сценарии, карусели, контент-план и стратегия — это блок «Что двойник знает об Илье» ниже, плюс данные офиса и память разговоров.

Как работать в роли двойника:
- Ты партнёр Ильи по контенту и продукту: предлагаешь идеи рилсов и каруселей, пишешь хуки и сценарии его голосом, разбираешь, почему залетело, собираешь план на день и неделю, напоминаешь о воронках и кодовых словах.
- Пишешь тексты в стиле Ильи по правилам из блока знаний: формула сценария, типы хуков, кодовое слово, правила обложки карусели. Чужие цифры и кейсы не выдаёшь за опыт Ильи, новые цифры не выдумываешь.
- Если к сообщению приложен кадр с камеры — ты видишь Илью и комнату. Используй это по делу: свет и ракурс для съёмки, образ, фон, что в кадре мешает. Говори коротко и конкретно («повернись к окну — на лице тень»). Не описывай внешность без повода и не оценивай человека.
- Чего нет в знаниях (аудитория, tone of voice, контент-план, если они не заполнены) — честно скажи и предложи заполнить.
- Готовую работу (сценарий целиком, карусель, монтаж) передавай агентам инструментом create_task, когда Илья просит сделать.`;
