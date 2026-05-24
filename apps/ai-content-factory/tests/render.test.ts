import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Ajv } from 'ajv';
import { carouselSchema, type Carousel } from '../src/schemas/carousel.js';
import { getRubric } from '../src/lib/rubrics.js';
import { renderSlideHtml, type RenderContext } from '../src/renderers/templates.js';

const hood = getRubric('hood');

test('cover slide HTML carries headline, accent, handle, counter and SWIPE LEFT', () => {
  const ctx: RenderContext = { rubric: hood, index: 0, total: 6 };
  const html = renderSlideHtml(
    { type: 'cover', title: 'Большая новость', subtitle: 'Подзаголовок', label: 'НЕЙРОНОВОСТИ' },
    ctx,
  );
  assert.match(html, /Большая новость/);
  assert.match(html, /SWIPE LEFT/);
  assert.match(html, /1\/6/);
  assert.ok(html.includes(hood.handle));
  assert.ok(html.includes(hood.accent));
});

test('cta slide HTML renders the keyword as the accent CTA', () => {
  const ctx: RenderContext = { rubric: hood, index: 5, total: 6 };
  const html = renderSlideHtml({ type: 'cta', headline: '«СВЯЗКА»', action: 'Пиши' }, ctx);
  assert.match(html, /«СВЯЗКА»/);
  assert.match(html, /class="keyword"/);
  assert.match(html, /6\/6/);
});

test('slide text is HTML-escaped', () => {
  const ctx: RenderContext = { rubric: hood, index: 0, total: 1 };
  const html = renderSlideHtml({ type: 'quote', text: '<script>alert(1)</script>' }, ctx);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('fixture hood-sample.json is a schema-valid carousel', () => {
  const ajv = new Ajv({ discriminator: true, allErrors: true });
  const validate = ajv.compile(carouselSchema);
  const fixture = JSON.parse(
    readFileSync(resolve('tests/fixtures/hood-sample.json'), 'utf8'),
  ) as Carousel;
  assert.ok(validate(fixture), ajv.errorsText(validate.errors));
});
