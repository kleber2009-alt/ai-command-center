import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { reelsSchema, totalDuration, formatScript, type ReelsScript } from '../src/schemas/reels.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(reelsSchema);

const sample: ReelsScript = {
  hook: 'Заплатил $150 за Claude Certified. Стоит того?',
  scenes: [
    { text: 'Сценарий 1: о чём пост', duration: 4, footageTag: 'talking-head' },
    { text: 'Сценарий 2: проблема', duration: 5, footageTag: 'screen-cast' },
    { text: 'Сценарий 3: решение', duration: 6, footageTag: 'b-roll-typing' },
    { text: 'Сценарий 4: CTA', duration: 4, footageTag: 'talking-head' },
  ],
  cta: 'Напиши CLAUDE в комментарии — пришлю PDF со связками',
  subtitles: ['Хук', 'Проблема', 'Решение', 'CTA'],
};

test('reels schema accepts a valid script', () => {
  const ok = validate(sample);
  assert.equal(ok, true, JSON.stringify(validate.errors));
});

test('reels schema rejects an empty scenes array', () => {
  const bad = { ...sample, scenes: [] };
  assert.equal(validate(bad), false);
});

test('reels schema rejects a scene with extra fields', () => {
  const bad = {
    ...sample,
    scenes: [{ text: 't', duration: 4, footageTag: 'tg', extra: 'nope' }],
  };
  assert.equal(validate(bad), false);
});

test('totalDuration sums scene durations', () => {
  assert.equal(totalDuration(sample), 4 + 5 + 6 + 4);
});

test('formatScript includes hook, scenes, cta, and subtitles', () => {
  const md = formatScript(sample);
  assert.ok(md.includes(sample.hook));
  assert.ok(md.includes(sample.cta));
  for (const s of sample.scenes) assert.ok(md.includes(s.text));
  for (const sub of sample.subtitles) assert.ok(md.includes(sub));
});

test('reels schema accepts scenes with clipFile instead of footageTag', () => {
  const withClipFile: ReelsScript = {
    ...sample,
    scenes: [
      { text: 'Сцена 1', duration: 4, clipFile: 'talking-head/1234-hook.mp4' },
      { text: 'Сцена 2', duration: 5, clipFile: 'screen-cast/5678-demo.mp4' },
      { text: 'Сцена 3', duration: 6, clipFile: 'b-roll-typing/9999-hands.mp4' },
    ],
  };
  assert.equal(validate(withClipFile), true, JSON.stringify(validate.errors));
});

test('reels schema accepts a mix of clipFile and footageTag', () => {
  const mixed: ReelsScript = {
    ...sample,
    scenes: [
      { text: 'a', duration: 4, clipFile: 'talking-head/h.mp4' },
      { text: 'b', duration: 4, footageTag: 'b-roll-coffee' },
      { text: 'c', duration: 5, clipFile: 'screen-cast/d.mp4', footageTag: 'screen-cast' },
    ],
  };
  assert.equal(validate(mixed), true, JSON.stringify(validate.errors));
});
