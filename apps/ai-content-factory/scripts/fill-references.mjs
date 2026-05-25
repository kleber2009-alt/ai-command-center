// Replaces placeholder.png in each references slot with a real Puppeteer-rendered
// example slide that demonstrates the slot's технику. Each example is one slide
// from the standard carousel templates (cover / quote / list / stat / code / cta)
// with content tuned to the slot's idea.
//
// Usage (inside the container):
//   docker exec ai-content-factory node /app/scripts/fill-references.mjs

import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { renderSlideHtml, SLIDE_WIDTH, SLIDE_HEIGHT } from '/app/dist/renderers/templates.js';

const ROOT = '/app/data/assets/references';
const HOOD = { label: 'НЕЙРОНОВОСТИ', categoryTag: 'Нейросети | ИИ | Маркетинг', accent: '#2563EB', coverBg: '#E6157B', handle: '@ilia.paliy', formula: 'hood' };
const DIARY = { label: 'ДНЕВНИК АРХИТЕКТОРА', accent: '#60c8f0', handle: '@ILIA · CLAUDE PATH', formula: 'diary' };
const ROUTINE = { label: 'ROUTINE', accent: '#84e0a3', handle: '@ilia.paliy', formula: 'routine' };
const MONEY = { label: 'MONEY', accent: '#d96be8', handle: '@ilia.paliy', formula: 'money' };

// 30 examples — each demonstrates the slot idea
const REFS = [
  { slot: 'ref-01-hook-stat',          rubric: HOOD,    slide: { type: 'stat',  value: '142%', caption: 'роста сохранений после правки одного промпта' } },
  { slot: 'ref-02-hook-question',      rubric: DIARY,   slide: { type: 'cover', title: 'Какая одна ошибка убивает охваты карусели?', subtitle: 'Разбираю на 7 примерах' } },
  { slot: 'ref-03-hook-confession',    rubric: MONEY,   slide: { type: 'cover', title: 'Я заплатил $150 за Claude Certified', subtitle: 'Стоит того или нет — честно' } },
  { slot: 'ref-04-hook-mistake',       rubric: HOOD,    slide: { type: 'cover', title: 'Самая частая ошибка фрилансеров', subtitle: 'Они спрашивают Claude как Google' } },
  { slot: 'ref-05-hook-secret',        rubric: HOOD,    slide: { type: 'cover', title: 'Anthropic выкатил Skills — и почти никто не пользуется', label: 'инсайт' } },

  { slot: 'ref-06-stat-bigbang',       rubric: HOOD,    slide: { type: 'stat',  value: '$0.001', caption: 'столько стоит описание одного клипа через Claude Vision' } },
  { slot: 'ref-07-stat-comparison',    rubric: HOOD,    slide: { type: 'list',  title: 'Было / стало', items: ['Раньше: 1 час на сценарий', 'Сейчас: 2 минуты', 'Разница: 30× по времени', 'Цена: $0.05 за прогон'] } },

  { slot: 'ref-08-list-numbered',      rubric: DIARY,   slide: { type: 'list',  title: '5 доменов CCA', items: ['Foundations — модели и API', 'Prompt engineering', 'Skills и MCP', 'Safety и evals', 'Deployment в проде'] } },
  { slot: 'ref-09-list-checklist',     rubric: ROUTINE, slide: { type: 'list',  title: 'Чек-лист настройки Skill', items: ['Скелет .md в папке skill/', 'Описание роли первой строкой', 'Examples в формате input → output', 'Test на 3 крайних кейсах', 'Push в Anthropic Workbench'] } },

  { slot: 'ref-10-quote-large',        rubric: DIARY,   slide: { type: 'quote', text: 'The hottest new programming language is English.', author: 'Andrej Karpathy' } },

  { slot: 'ref-11-code-monospace',     rubric: DIARY,   slide: { type: 'code',  code: `await client.messages.create({\n  model: 'claude-opus-4-7',\n  max_tokens: 4096,\n  messages: [{ role: 'user', content: prompt }],\n});`, language: 'typescript', caption: 'минимальный вызов Claude API' } },

  { slot: 'ref-12-screenshot-ui',      rubric: ROUTINE, slide: { type: 'cover', title: 'Claude Console: первый запрос за 30 секунд', subtitle: 'Скриншот UI с подсвеченным prompt-input' } },
  { slot: 'ref-13-diagram-flow',       rubric: ROUTINE, slide: { type: 'list',  title: 'n8n flow', items: ['Webhook (вход)', '→ Claude (генерация)', '→ Telegram (доставка)', 'Результат: 1 пост в день автоматом'] } },
  { slot: 'ref-14-diagram-venn',       rubric: HOOD,    slide: { type: 'list',  title: 'Skills ∩ MCP', items: ['Skills = инструкции "что делать"', 'MCP = инструменты "чем пользоваться"', 'Вместе = full agent', 'Без одного — не работает'] } },

  { slot: 'ref-15-tip-tactical',       rubric: ROUTINE, slide: { type: 'cover', title: 'Один промпт = час в день', subtitle: 'Покажу формулу system prompt-а под рутину', label: 'tip' } },
  { slot: 'ref-16-tip-before-after',   rubric: MONEY,   slide: { type: 'list',  title: 'До / После', items: ['До: 10 часов в неделю на контент', 'После: 2 часа на стратегию', 'Экономия: 8 часов × 4 недели = 32 часа', 'В деньгах: ~$1600/мес'] } },
  { slot: 'ref-17-warning-pitfall',    rubric: HOOD,    slide: { type: 'cover', title: 'Без schema validation Claude уронит твой прод', subtitle: 'Добавь Ajv — больше не упадёт', label: 'warning' } },

  { slot: 'ref-18-meta-howto',         rubric: DIARY,   slide: { type: 'list',  title: 'Как читать эту карусель', items: ['Свайп слева направо', 'Сохрани если зашло', 'Кодовое слово в конце — в комменты', 'Шлю PDF в директ'] } },
  { slot: 'ref-19-recap-bullets',      rubric: HOOD,    slide: { type: 'list',  title: 'Recap карусели', items: ['Skills экономит 30% времени', 'MCP добавляет инструменты', 'RAG нужен >5000 документов', 'Production = Skills + MCP + RAG'] } },

  { slot: 'ref-20-cta-keyword',        rubric: HOOD,    slide: { type: 'cta',   headline: 'Напиши SKILL в комментариях', action: 'Пришлю свой Claude Skill для рилсов в директ' } },
  { slot: 'ref-21-cta-save',           rubric: DIARY,   slide: { type: 'cta',   headline: 'Сохрани этот пост', action: 'Чек-лист пригодится при следующей настройке' } },

  { slot: 'ref-22-style-typo-bold',    rubric: MONEY,   slide: { type: 'cover', title: 'CLAUDE CERTIFIED', subtitle: '$150 · 5 доменов · 1 месяц' } },
  { slot: 'ref-23-style-minimalist',   rubric: DIARY,   slide: { type: 'cover', title: 'Меньше промпт — больше результат', subtitle: 'Сегодня узнал почему' } },
  { slot: 'ref-24-style-editorial',    rubric: HOOD,    slide: { type: 'cover', title: 'Reels автоматизация', subtitle: 'От идеи до 30-секундного MP4 без монтажа', label: 'spread' } },
  { slot: 'ref-25-style-handwriting',  rubric: ROUTINE, slide: { type: 'cover', title: 'utro · kofe · claude', subtitle: 'три минуты на брифинг дня' } },

  { slot: 'ref-26-color-mono-accent',  rubric: DIARY,   slide: { type: 'stat',  value: '5', caption: 'доменов экзамена CCA Foundations' } },
  { slot: 'ref-27-color-gradient',     rubric: HOOD,    slide: { type: 'cover', title: 'Anthropic Workbench', subtitle: 'Side-by-side сравнение Opus и Haiku', label: 'demo' } },
  { slot: 'ref-28-layout-asymmetric',  rubric: MONEY,   slide: { type: 'stat',  value: '$30', caption: '— месяц production-системы на Anthropic API' } },
  { slot: 'ref-29-layout-grid',        rubric: ROUTINE, slide: { type: 'list',  title: 'Toolchain', items: ['Claude — генерация', 'Voyage — embeddings', 'sqlite-vec — vector store', 'n8n — оркестрация'] } },
  { slot: 'ref-30-format-meme',        rubric: DIARY,   slide: { type: 'cover', title: 'Я: знаю Claude API', subtitle: 'Anthropic: представляем Skills, MCP, computer use, files, batch...' } },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
});

let done = 0;
for (const { slot, rubric, slide } of REFS) {
  const dir = join(ROOT, slot);
  mkdirSync(dir, { recursive: true });
  // Wipe existing placeholder/example PNGs so re-runs are clean
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))) {
      try { unlinkSync(join(dir, f)); } catch { /* ignore */ }
    }
  }
  const ctx = { rubric, index: 0, total: 1 };
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, deviceScaleFactor: 2 });
    await page.setContent(renderSlideHtml(slide, ctx), { waitUntil: 'load' });
    const file = join(dir, `${Date.now()}-example.png`);
    const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT } });
    writeFileSync(file, buffer);
    console.log(`  ${slot} → ${file}`);
    done++;
  } finally {
    await page.close();
  }
}

await browser.close();
// Reset .meta.json so describer re-runs on the new examples
try {
  for (const slot of REFS.map((r) => r.slot)) {
    const meta = join(ROOT, slot, '.meta.json');
    if (existsSync(meta)) unlinkSync(meta);
  }
} catch { /* ignore */ }

console.log(`\nDone. Rendered ${done} reference examples.`);
