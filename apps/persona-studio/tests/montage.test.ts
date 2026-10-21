import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptions, keepSegments, mapTime, remapWords, totalDuration } from '../src/lib/montage/edl.ts';
import { buildAss, assColor, assFontSize } from '../src/lib/montage/ass.ts';
import { MONTAGE_PRESETS, montagePreset } from '../src/lib/montage/presets.ts';
import { SKILL_STYLES, parseAccents, findSkillStyle } from '../src/lib/skills/styles.ts';

const words = [
  { w: 'Привет,', s: 1.0, e: 1.4 },
  { w: 'сегодня', s: 1.5, e: 1.9 },
  { w: 'покажу', s: 2.0, e: 2.4 },
  // пауза 1.6 c — должна вырезаться
  { w: 'монтаж', s: 4.0, e: 4.5 },
  { w: '100%', s: 4.55, e: 4.9 },
];

test('keepSegments режет паузы длиннее gapMax и держит запас keep', () => {
  const segs = keepSegments(words, 6, { gapMax: 0.2, keep: 0.08 });
  assert.equal(segs.length, 2);
  assert.ok(Math.abs(segs[0].s - 0.92) < 1e-9);
  assert.ok(Math.abs(segs[1].e - 4.98) < 1e-9);
  assert.ok(totalDuration(segs) < 3);
});

test('mapTime/remapWords переносят слова на выходной таймлайн монотонно', () => {
  const segs = keepSegments(words, 6, { gapMax: 0.2, keep: 0.08 });
  assert.equal(mapTime(3.0, segs), null);
  const out = remapWords(words, segs);
  assert.equal(out.length, words.length);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].s >= out[i - 1].e - 1e-9);
});

test('buildCaptions: не больше max слов, акцент на числе', () => {
  const caps = buildCaptions(words, { min: 1, max: 3, maxChars: 18 });
  assert.ok(caps.every((c) => c.words.length <= 3));
  const withNum = caps.find((c) => c.words.some((w) => w.w === '100%'));
  assert.ok(withNum && withNum.accent != null && withNum.words[withNum.accent].w === '100%');
});

test('buildAss: хук, призыв и субтитры попадают в события', () => {
  const caps = buildCaptions(words, { min: 1, max: 3, maxChars: 18 });
  const ass = buildAss({ preset: montagePreset('palii'), captions: caps, duration: 12, hookTitle: 'монтаж *кодом*', ctaWord: 'гайд' });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /,Hook,/);
  assert.match(ass, /«ГАЙД»/);
  assert.match(ass, /\\c&H00FAEA&/); // лайм палия как inline-тег
  assert.equal(assColor('#EAFA00'), '&H0000FAEA');
});

test('пресеты монтажа ссылаются на существующие стили и уникальны', () => {
  const ids = MONTAGE_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of MONTAGE_PRESETS) {
    assert.ok(findSkillStyle(p.styleId ?? p.id), `нет стиля для пресета ${p.id}`);
  }
});

test('reveal: по событию на слово, будущие слова невидимы, строка одна и та же', () => {
  // короткие слова без пунктуации — один субтитр, без акцента
  const phrase = [
    { w: 'это', s: 1.0, e: 1.3 },
    { w: 'мой', s: 1.4, e: 1.7 },
    { w: 'рилс', s: 1.8, e: 2.2 },
  ];
  const caps = buildCaptions(phrase, { min: 1, max: 5, maxChars: 30 });
  assert.equal(caps.length, 1);
  const ass = buildAss({ preset: montagePreset('promoface'), captions: caps, duration: 12 });
  const capEvents = ass.split('\n').filter((l) => l.includes(',Cap,'));
  // одно событие на каждое слово
  assert.equal(capEvents.length, phrase.length);
  // первое событие: следующие слова скрыты, но присутствуют (строка не перестраивается)
  const first = capEvents[0];
  assert.match(first, /\{\\alpha&HFF&\}мой\{\\alpha&H00&\} \{\\alpha&HFF&\}рилс/);
  // произносимое слово приходит синим #0D83FF и перетекает в белый
  assert.match(first, /\\1c&HFF830D&\\t\(200,470,\\1c&HFFFFFF&\)/);
  // promo-face: слово появляется за 0.1 c до произнесения (1.4 − 0.1)
  assert.match(capEvents[1], /Dialogue: 1,0:00:01\.30,/);
  // тень без обводки
  assert.match(ass, /Style: Cap,InterTight 700,122,[^\n]*,1,0,4,5,/); // 86 CSS px × 1.424
});

test('вход субтитра целиком: neon-schema — сдвиг 18 px и размытие 6 → 0', () => {
  const caps = buildCaptions(words, { min: 1, max: 1, maxChars: 18 });
  const ass = buildAss({ preset: montagePreset('scheme'), captions: caps, duration: 12 });
  assert.match(ass, /\\move\(558,1350,540,1350,0,133\)\\fad\(133,0\)\\blur6\\t\(0,133,\\blur0\)/);
  assert.match(ass, /ПРИВЕТ,/); // капс
});

test('YouTube: слово входит с масштаба 1.35 и размытия 12', () => {
  const caps = buildCaptions(words, { min: 2, max: 5, maxChars: 34 });
  const ass = buildAss({ preset: montagePreset('youtube'), captions: caps, duration: 12 });
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /\\alpha&HFF&\\blur12\\fscy135\\t\(0,167,\\alpha&H00&\\blur0\\fscy100\)/);
});

test('каталог скилл-стилей: 20 уникальных, разметка акцента', () => {
  assert.equal(SKILL_STYLES.length, 20);
  assert.equal(new Set(SKILL_STYLES.map((s) => s.id)).size, 20);
  assert.deepEqual(parseAccents('5 *промптов*, которые'), [[
    { text: '5 ', accent: false },
    { text: 'промптов', accent: true },
    { text: ', которые', accent: false },
  ]]);
});

test('assFontSize: CSS-пиксели скилла → кегль libass по Win-метрикам шрифта', () => {
  assert.equal(assFontSize('Montserrat 800', 84), 131); // 84 × 1.562
  assert.equal(assFontSize('Playfair 700 Italic', 100), 141);
  assert.equal(assFontSize('JetBrains Mono', 100), 157);
  assert.equal(assFontSize('Неизвестный 400', 100), 145); // запасной коэффициент
});
