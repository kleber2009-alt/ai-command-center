import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, extractSlideImages } from '../src/lib/parser/scoring.ts';
import { apifyErrorText, inRemixCooldown, median, rankOwnKind, type OwnPostInput } from '../src/lib/blog/rank.ts';
import {
  buildRemixSpec,
  coerceRemixAi,
  ctaLine,
  extractCodeWord,
  normalizeCodeWord,
  sanitizeSlides,
  swapCtaWord,
} from '../src/lib/carousel/remix.ts';
import { tokenize } from '../src/lib/carousel/render-remix.ts';

const ts = new Date(Date.now() - 3 * 86_400_000).toISOString();

// ── carousel child-image extraction ────────────────────────────────────

test('extractSlideImages: childPosts in order, video child → its poster, dedupe', () => {
  const urls = extractSlideImages({
    type: 'Sidecar',
    displayUrl: 'https://cdn/x/1.jpg',
    images: ['https://cdn/x/1.jpg', 'https://cdn/x/zzz.jpg'],
    childPosts: [
      { type: 'Image', displayUrl: 'https://cdn/x/1.jpg' },
      { type: 'Video', displayUrl: 'https://cdn/x/2-poster.jpg', videoUrl: 'https://cdn/x/2.mp4' },
      { type: 'Image', displayUrl: 'https://cdn/x/3.jpg' },
      { type: 'Image', displayUrl: 'https://cdn/x/3.jpg' },
    ],
  });
  assert.deepEqual(urls, ['https://cdn/x/1.jpg', 'https://cdn/x/2-poster.jpg', 'https://cdn/x/3.jpg']);
});

test('extractSlideImages: falls back to images[], then displayUrl', () => {
  assert.deepEqual(extractSlideImages({ type: 'Sidecar', images: ['https://a/1.jpg', 'https://a/2.jpg'], childPosts: [] }), [
    'https://a/1.jpg',
    'https://a/2.jpg',
  ]);
  assert.deepEqual(extractSlideImages({ type: 'Sidecar', displayUrl: 'https://a/only.jpg' }), ['https://a/only.jpg']);
  assert.deepEqual(extractSlideImages({ sidecarChildren: [{ display_url: 'https://a/s1.jpg' }, { imageUrl: 'https://a/s2.jpg' }] }), [
    'https://a/s1.jpg',
    'https://a/s2.jpg',
  ]);
  assert.deepEqual(extractSlideImages(null), []);
});

test('classify keeps the competitor contract and adds slides / full caption for carousels', () => {
  const long = 'Пиши «ГАЙД» в комментариях\n\n' + 'x'.repeat(900);
  const cls = classify([
    {
      url: 'https://www.instagram.com/p/C1/',
      shortCode: 'C1',
      type: 'Sidecar',
      caption: long,
      likesCount: -1, // hidden likes
      commentsCount: 420,
      timestamp: ts,
      displayUrl: 'https://cdn/c1/1.jpg',
      childPosts: [{ displayUrl: 'https://cdn/c1/1.jpg' }, { displayUrl: 'https://cdn/c1/2.jpg' }],
    },
    {
      url: 'https://www.instagram.com/reel/R1/',
      shortCode: 'R1',
      type: 'Video',
      productType: 'clips',
      caption: 'reel',
      videoUrl: 'https://cdn/r1.mp4',
      videoPlayCount: 5000,
      likesCount: 100,
      commentsCount: 10,
      timestamp: ts,
      images: ['https://cdn/r1-a.jpg', 'https://cdn/r1-b.jpg'],
    },
  ]);
  assert.equal(cls.carousels.length, 1);
  assert.equal(cls.reels.length, 1);
  const c = cls.carousels[0];
  assert.equal(c.caption.length, 400, 'competitor caption stays capped');
  assert.equal(c.fullCaption, long);
  assert.deepEqual(c.slideImages, ['https://cdn/c1/1.jpg', 'https://cdn/c1/2.jpg']);
  assert.equal(c.likes, 0, 'hidden likes (-1) become 0');
  assert.equal(c.videoUrl, null);
  const r = cls.reels[0];
  assert.equal(r.videoUrl, 'https://cdn/r1.mp4');
  assert.deepEqual(r.slideImages, [], 'reels carry no slides');
});

// ── own-median ranking ─────────────────────────────────────────────────

const car = (id: string, comments: number, shares: number, likes = 0, daysAgo = 30): OwnPostInput => ({
  id,
  kind: 'carousel',
  plays: 0,
  likes,
  comments,
  shares,
  postedAt: new Date(Date.now() - daysAgo * 86_400_000),
});

test('median handles odd/even/empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test('rankOwnKind: carousels by comments vs own median; hidden likes are dropped from weights', () => {
  const posts = [car('a', 100, 10), car('b', 100, 10), car('c', 400, 12), car('d', 40, 30), car('e', 100, 10)];
  const { medians, ranks } = rankOwnKind(posts, 'carousel');
  assert.equal(medians.comments, 100);
  assert.equal(medians.likes, 0);
  assert.equal(ranks[0].id, 'c', 'the comment winner ranks first');
  assert.equal(ranks[0].best, true);
  assert.equal(ranks[0].winner, true);
  assert.equal(ranks[0].ratios.likes, undefined, 'likes weight removed when nobody has likes');
  const d = ranks.find((r) => r.id === 'd')!;
  assert.equal(d.strongBody, true, 'many shares, few comments → strong body, weak hook');
  assert.equal(d.winner, false);
  const typical = ranks.find((r) => r.id === 'a')!;
  assert.ok(Math.abs(typical.score - 1) < 1e-9, 'a median post scores 1.0');
  assert.equal(typical.best, false);
});

test('rankOwnKind: reels by views / ER / shares relative to own median', () => {
  const reel = (id: string, plays: number, likes: number, shares: number): OwnPostInput => ({ id, kind: 'reel', plays, likes, comments: 0, shares, postedAt: null });
  const { ranks, medians } = rankOwnKind([reel('x', 10_000, 500, 20), reel('y', 10_000, 500, 20), reel('z', 60_000, 3000, 80)], 'reel');
  assert.equal(medians.views, 10_000);
  assert.equal(ranks[0].id, 'z');
  assert.ok(ranks[0].score > 2);
  assert.equal(ranks[0].er, 5);
});

test('remix cooldown is 14 days', () => {
  assert.equal(inRemixCooldown(new Date(Date.now() - 5 * 86_400_000)), true);
  assert.equal(inRemixCooldown(new Date(Date.now() - 20 * 86_400_000)), false);
  assert.equal(inRemixCooldown(null), false);
});

test('apifyErrorText turns unpaid invoices into a readable Russian message', () => {
  const t = apifyErrorText('apify 403: {"error":{"type":"platform-feature-disabled","message":"Too many outstanding invoices"}}');
  assert.match(t, /Apify/);
  assert.match(t, /неоплаченн/);
  assert.match(apifyErrorText('APIFY_TOKEN missing'), /APIFY_TOKEN/);
});

// ── remix spec ─────────────────────────────────────────────────────────

const SLIDES = ['s/1.jpg', 's/2.jpg', 's/3.jpg', 's/4.jpg', 's/5.jpg', 's/6.jpg'];
const CAPTION = 'Как я веду блог с Claude\n\nТри шага, которые экономят часы.\n\nПиши «ПРАКТИКУМ» в комментариях — пришлю гайд';

test('code word extraction and normalisation', () => {
  assert.equal(extractCodeWord(CAPTION), 'ПРАКТИКУМ');
  assert.equal(extractCodeWord('Напиши + в комментарии и получишь'), '+');
  assert.equal(extractCodeWord('просто текст'), null);
  assert.equal(normalizeCodeWord(' «гайд!» '), 'ГАЙД');
  assert.equal(ctaLine('claude'), 'Пиши *«CLAUDE»* в комментариях →');
  assert.equal(swapCtaWord('Пиши *«ГАЙД»* сюда →', 'ГАЙД', 'промпт'), 'Пиши *«ПРОМПТ»* сюда →');
});

test('buildRemixSpec: cover + kept originals in AI order + CTA, new code word, caption template', () => {
  const ai = coerceRemixAi({
    hooks: [
      { title: 'Удаляй ChatGPT *если ведёшь блог*', sub: '4 вещи, которые Claude делает →', why: 'провокация' },
      { title: 'Claude ведёт мой блог *за меня*', sub: 'покажу как', why: 'результат' },
    ],
    codeWord: 'claude',
    ctaPromise: 'пришлю гайд в директ',
    caption: 'Три шага, которые экономят часы.',
    keep: [4, 2, 3, 2, 6, 1, 99],
    rationale: 'победитель — новый угол',
  });
  const { slides, meta } = buildRemixSpec({ sourceImages: SLIDES, caption: CAPTION, sourceKind: 'winner', ai, allowDrop: true });
  assert.deepEqual(
    slides.map((s) => [s.role, s.src]),
    [
      ['cover', 0],
      ['keep', 3],
      ['keep', 1],
      ['keep', 2],
      ['cta', 5],
    ],
    'invalid / duplicate / cover / CTA indices are dropped from keep',
  );
  assert.equal(slides[0].title, 'Удаляй ChatGPT *если ведёшь блог*');
  assert.equal(meta.codeWord, 'CLAUDE');
  assert.equal(meta.oldCodeWord, 'ПРАКТИКУМ');
  assert.equal(slides[4].title, 'Пиши *«CLAUDE»* в комментариях →');
  assert.ok(meta.caption.split('\n')[0].includes('CLAUDE'), 'code word on the first line');
  assert.match(meta.caption, /Сохраняй, чтобы не потерять/);
  assert.equal(meta.hooks.length, 2);
  assert.equal(meta.provider, 'ai');
  // without vision the AI may reorder but not drop: the missing slide goes back at the end
  const blind = buildRemixSpec({ sourceImages: SLIDES, caption: CAPTION, sourceKind: 'winner', ai });
  assert.deepEqual(blind.slides.map((s) => s.src), [0, 3, 1, 2, 4, 5]);
});

test('buildRemixSpec without AI: template hooks, all body slides, word differs from the old one', () => {
  const { slides, meta } = buildRemixSpec({ sourceImages: SLIDES, caption: CAPTION, sourceKind: 'strongBody' });
  assert.equal(slides.length, 6);
  assert.deepEqual(slides.slice(1, -1).map((s) => s.src), [1, 2, 3, 4]);
  assert.notEqual(meta.codeWord, 'ПРАКТИКУМ');
  assert.equal(meta.provider, 'fallback');
  assert.match(meta.rationale, /Сильная начинка/);
  // two-slide carousel → cover + CTA only
  const two = buildRemixSpec({ sourceImages: ['a', 'b'], caption: '', sourceKind: 'regular' });
  assert.deepEqual(two.slides.map((s) => s.role), ['cover', 'cta']);
  assert.throws(() => buildRemixSpec({ sourceImages: ['a'], caption: '', sourceKind: 'regular' }));
});

test('buildRemixSpec rejects an AI that reuses the old code word or empties the body', () => {
  const { slides, meta } = buildRemixSpec({
    sourceImages: SLIDES,
    caption: CAPTION,
    sourceKind: 'winner',
    ai: { codeWord: 'практикум', keep: [3] },
  });
  assert.notEqual(meta.codeWord, 'ПРАКТИКУМ');
  assert.equal(slides.length, 6, 'dropping more than half of the body falls back to all slides');
});

test('sanitizeSlides enforces cover first, CTA last, valid indices', () => {
  const ok = sanitizeSlides(
    [
      { role: 'cover', src: 0, title: 'x', body: 'y', textPos: 'bottom' },
      { role: 'keep', src: 2, title: 'ignored' },
      { role: 'cta', src: 5, title: 'cta', body: 'b', veil: 'solid' },
    ],
    6,
  );
  assert.ok(ok);
  assert.equal(ok![1].title, '');
  assert.equal(ok![0].textPos, 'bottom');
  assert.equal(sanitizeSlides([{ role: 'keep', src: 1 }, { role: 'cta', src: 5 }], 6), null);
  assert.equal(sanitizeSlides([{ role: 'cover', src: 0 }, { role: 'cta', src: 9 }], 6), null);
});

test('tokenize keeps accents and never leaves «→» or a dash alone on a line', () => {
  const t = tokenize('Удаляй *если ведёшь* — блог →\nдальше');
  const words = t.map((x) => ('br' in x ? '|' : `${x.accent ? '*' : ''}${x.text}`));
  assert.deepEqual(words, ['Удаляй', '*если', '*ведёшь', '— блог →', '|', 'дальше']);
});
