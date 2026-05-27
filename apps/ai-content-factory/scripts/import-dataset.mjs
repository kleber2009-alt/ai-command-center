// Converts carousel_prompts_dataset.md → data/brandbook/dataset.json.
//
// Source file: ~/Downloads/carousel_prompts_dataset.md (54 slides from
// @ilia.paliy / @theromanknox / @drcintas / @julieta_publicista).
//
// Usage:
//   node scripts/import-dataset.mjs <source.md> <output.json>
// Or with defaults:
//   node scripts/import-dataset.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = process.argv[2] ?? '/Users/iliapaliy/Downloads/carousel_prompts_dataset.md';
const OUT = process.argv[3] ?? 'data/brandbook/dataset.json';

const md = readFileSync(SRC, 'utf8');

// Split on slide headers ("## IMG_xxxx.png")
const blocks = md.split(/^## (IMG_\d+\.png)\s*$/m);
// blocks[0] = preamble, then alternating [name, body, name, body, ...]
const slides = [];
for (let i = 1; i < blocks.length; i += 2) {
  const filename = blocks[i];
  const body = blocks[i + 1] ?? '';
  slides.push(parseSlide(filename, body));
}

function pick(body, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)\\s*(?:\\n|$)`, 'm');
  const m = body.match(re);
  return m ? m[1].trim() : undefined;
}

function pickSection(body, header) {
  // ### header\n\nblock until next ### or end
  const re = new RegExp(`^### ${escapeRe(header)}\\s*\\n+([\\s\\S]*?)(?=\\n### |\\n## |\\Z)`, 'm');
  const m = body.match(re);
  return m ? m[1].trim() : undefined;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseKVList(text) {
  if (!text) return undefined;
  const lines = text.split('\n');
  const out = {};
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\*\*([^:]+):\*\*\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      // nested checklist becomes array later — for now flat string
      out[key] = val;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseImageGenPrompt(text) {
  if (!text) return undefined;
  // The prompt is in a "> " blockquote one-liner
  const m = text.match(/^>\s*(.+)$/m);
  return m ? m[1].trim() : text.trim();
}

function parseSlide(filename, body) {
  // Header line: "**Автор:** @name  \n**Карусель:** topic  \n**Позиция:** X/Y | **Роль в воронке:** `role` | **Формат:** ..."
  const author = pick(body, 'Автор');
  const carousel = pick(body, 'Карусель');
  const posMatch = body.match(/\*\*Позиция:\*\*\s*([^|\n]+)\|/);
  const roleMatch = body.match(/\*\*Роль в воронке:\*\*\s*`([^`]+)`/);
  const formatMatch = body.match(/\*\*Формат:\*\*\s*([^\n]+)/);

  const visual = pickSection(body, 'Визуальное описание');
  const textBlock = pickSection(body, 'Текстовое содержание');
  const structure = pickSection(body, 'Структура слайда');
  const tokensBlock = pickSection(body, 'Дизайн-токены');
  const imageGen = pickSection(body, 'Промпт для генерации изображения');

  return {
    filename,
    author,
    carousel_topic: carousel,
    slide_position: posMatch ? posMatch[1].trim() : undefined,
    funnel_role: roleMatch ? roleMatch[1].trim() : undefined,
    format: formatMatch ? formatMatch[1].trim() : undefined,
    visual_description: visual,
    text_content: parseKVList(textBlock),
    structure,
    design_tokens: parseKVList(tokensBlock),
    image_generation_prompt: parseImageGenPrompt(imageGen),
  };
}

const out = {
  description:
    '54 эталонных слайда из 12 карусели от @ilia.paliy / @theromanknox / @drcintas / ' +
    '@julieta_publicista. Reference dataset для генерации Instagram-карусели в стилистике этих авторов. ' +
    'Используй это как образец воронки (cover/hook/problem/step/proof/offer/cta), визуальной подачи, ' +
    'типографики, лид-магнитов и CTA-шаблонов. НЕ копируй текст дословно — используй структуру и приёмы.',
  source: 'carousel_prompts_dataset.md',
  generated_at: new Date().toISOString(),
  slide_count: slides.length,
  carousels: groupByCarousel(slides),
  slides,
};

function groupByCarousel(items) {
  const map = new Map();
  for (const s of items) {
    const key = `${s.author} :: ${s.carousel_topic}`;
    if (!map.has(key)) {
      map.set(key, { author: s.author, topic: s.carousel_topic, slides: [] });
    }
    map.get(key).slides.push(s.filename);
  }
  return [...map.values()];
}

writeFileSync(resolve(OUT), JSON.stringify(out, null, 2), 'utf8');
console.log(`Parsed ${slides.length} slides → ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(1)} KB)`);
console.log('Carousels:');
for (const c of out.carousels) console.log(`  ${c.author} · ${c.topic} — ${c.slides.length} slides`);
