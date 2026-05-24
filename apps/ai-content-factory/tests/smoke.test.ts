import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Ajv } from 'ajv';
import { carouselSchema, type Carousel } from '../src/schemas/carousel.js';
import { interpolate } from '../src/lib/prompt.js';
import { extractJson } from '../src/generators/claude.js';

const ajv = new Ajv({ discriminator: true, allErrors: true });
const validateCarousel = ajv.compile(carouselSchema);

test('rubrics.json defines the four rubrics with required fields', () => {
  const rubrics = JSON.parse(readFileSync(resolve('data/rubrics.json'), 'utf8'));
  assert.deepEqual(Object.keys(rubrics).sort(), ['diary', 'hood', 'money', 'routine']);
  for (const [slug, cfg] of Object.entries<Record<string, unknown>>(rubrics)) {
    for (const field of ['label', 'accent', 'handle', 'formula', 'promptFile']) {
      assert.ok(cfg[field], `rubric "${slug}" missing "${field}"`);
    }
  }
});

test('prompt interpolation fills placeholders and rejects missing ones', () => {
  assert.equal(interpolate('Тема: {{topic}} #{{episode}}', { topic: 'X', episode: 7 }), 'Тема: X #7');
  assert.throws(() => interpolate('{{missing}}', {}), /no provided value/);
});

test('carousel schema accepts a valid 10-slide carousel', () => {
  const carousel: Carousel = {
    rubric: 'diary',
    topic: '5 доменов экзамена',
    episode: 7,
    slides: [
      { type: 'cover', title: 'День 7', subtitle: 'CCA Foundations', label: 'ДНЕВНИК' },
      { type: 'quote', text: 'Учить домены — это марафон', author: 'Ilia' },
      { type: 'list', title: 'Домены', items: ['Foundations', 'Prompting', 'Tools'] },
      { type: 'stat', value: '$150', caption: 'стоимость экзамена' },
      { type: 'code', code: 'await callClaude({ model: "opus" })', language: 'ts' },
      { type: 'list', items: ['Шаг 1', 'Шаг 2'] },
      { type: 'quote', text: 'Регулярность бьёт талант' },
      { type: 'stat', value: '5', caption: 'доменов' },
      { type: 'list', title: 'Итог', items: ['Готовься ежедневно'] },
      { type: 'cta', headline: 'Хочешь так же?', action: 'Подпишись' },
    ],
  };
  assert.ok(validateCarousel(carousel), ajv.errorsText(validateCarousel.errors));
});

test('carousel schema rejects an unknown slide type and missing fields', () => {
  assert.equal(
    validateCarousel({
      rubric: 'diary',
      topic: 't',
      episode: 1,
      slides: [{ type: 'banner', title: 'x' }],
    }),
    false,
  );
  assert.equal(
    validateCarousel({
      rubric: 'diary',
      topic: 't',
      episode: 1,
      slides: [{ type: 'stat', value: '5' }],
    }),
    false,
  );
});

test('extractJson recovers JSON from prose, fences and raw text', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Вот результат:\n```json\n{"a":2}\n```\nготово'), { a: 2 });
  assert.deepEqual(extractJson('prefix [1,2,3] suffix'), [1, 2, 3]);
  assert.throws(() => extractJson('нет json здесь'), /No JSON value found/);
});
