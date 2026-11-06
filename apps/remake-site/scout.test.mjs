/* Тесты отбора «План дня» (scout.mjs). Запуск: cd apps/remake-site && npm test (и при каждой выкладке). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, gate, candidates, planDay, planText } from './scout.mjs';

const NOW = Date.parse('2026-11-06T09:00:00Z');
const ago = (days) => new Date(NOW - days * 864e5).toISOString();
let n = 0;
const W = ['нейросети', 'продажи', 'воронка', 'клиенты', 'монтаж', 'бизнес', 'автоматизация', 'контент', 'деньги', 'команда', 'запуск', 'офис', 'сценарий', 'реклама', 'таргет', 'директ'];
const words = (k) => W.filter((_, i) => (i * 7 + k * 3) % 5 === 0).join(' ') + ` номер${k}`;
// raw items in the shape of apify~instagram-scraper
const reel = (o = {}) => ({ shortCode: 'R' + ++n, type: 'Video', productType: 'clips', videoUrl: 'https://cdn/x.mp4', ownerUsername: 'rival' + n,
  caption: words(n), videoPlayCount: 500000, commentsCount: 3000, reshareCount: 4000, likesCount: 20000,
  videoDuration: 40, timestamp: ago(1), ...o });
const car = (o = {}) => ({ shortCode: 'C' + ++n, type: 'Sidecar', ownerUsername: 'rival' + n, caption: words(n + 1),
  childPosts: [1, 2, 3, 4].map((i) => ({ type: 'Image', displayUrl: `https://cdn/${i}.jpg` })), commentsCount: 2500, reshareCount: 3000,
  likesCount: 9000, timestamp: ago(20), ...o });
const norm = (raw, own = false) => normalize(raw, { own });

test('нормализация: рилс, карусель (без просмотров), скрытые лайки, поиск рилсов (snake_case)', () => {
  const r = norm(reel({ likesCount: -1 }));
  assert.equal(r.kind, 'reel'); assert.equal(r.views, 500000); assert.equal(r.shares, 4000); assert.equal(r.likes, null);
  const c = norm(car());
  assert.equal(c.kind, 'carousel'); assert.equal(c.views, null); assert.equal(c.slides, 4);
  const s = normalize({ code: 'S1', product_type: 'clips', video_url: 'u', ig_play_count: 200000, comment_count: 1500, share_count: 2000,
    user: { username: 'Who' }, caption: { text: 'hi' }, taken_at: Math.floor(NOW / 1000) });
  assert.equal(s.author, 'who'); assert.equal(s.views, 200000); assert.equal(s.shares, 2000); assert.equal(s.caption, 'hi');
  assert.equal(normalize({ shortCode: 'P', type: 'Image' }), null);  // single photo — neither
});

test('пороги: 100к / 1000 / 1000 — жёстко; просмотры карусели не нужны; скрытые репосты — по настройке', () => {
  assert.equal(gate(norm(reel())).ok, true);
  assert.equal(gate(norm(reel({ videoPlayCount: 99999 }))).ok, false);
  assert.equal(gate(norm(reel({ commentsCount: 999 }))).ok, false);
  assert.equal(gate(norm(reel({ reshareCount: 999 }))).ok, false);
  assert.equal(gate(norm(reel({ videoPlayCount: undefined, videoViewCount: undefined }))).ok, false);  // views must be known for a reel
  assert.equal(gate(norm(car())).ok, true);
  const hidden = norm(reel({ reshareCount: undefined }));
  assert.equal(gate(hidden).ok, true); assert.deepEqual(gate(hidden).unknown, ['shares']);
  process.env.SCOUT_SHARES_UNKNOWN = 'fail';
  assert.equal(gate(hidden).ok, false);
  delete process.env.SCOUT_SHARES_UNKNOWN;
});

test('источники: свежее конкурентов → fresh, старое → best, своё → own; взятое не повторяется, своё — через 60 дней', () => {
  const posts = [norm(reel({ timestamp: ago(1) })), norm(reel({ timestamp: ago(40) })), norm(car({ timestamp: ago(100) }), true),
    norm(car({ timestamp: ago(3) }), true), norm(reel({ commentsCount: 10 }))];
  const { list, rejected } = candidates(posts, { now: NOW });
  assert.deepEqual(list.map((x) => x.source).sort(), ['best', 'fresh', 'own']);
  assert.equal(rejected.young, 1); assert.equal(rejected.low, 1);
  const used = { [posts[0].code]: ago(200), [posts[2].code]: ago(70) };
  const again = candidates(posts, { now: NOW, used }).list.map((x) => x.code);
  assert.ok(!again.includes(posts[0].code));  // a competitor's hit — never twice
  assert.ok(again.includes(posts[2].code));   // own hit — back after 60 days
  assert.ok(!candidates(posts, { now: NOW, used: { [posts[2].code]: ago(10) } }).list.some((x) => x.code === posts[2].code));
});

test('план: ровно 3 — 1R+2C или 2R+1C, один автор раз в день, сильнейшие побеждают', () => {
  const posts = [
    norm(reel({ ownerUsername: 'a', videoPlayCount: 3e6, commentsCount: 20000, reshareCount: 30000 })),
    norm(reel({ ownerUsername: 'a', videoPlayCount: 2e6, commentsCount: 15000, reshareCount: 20000 })),  // same author — not both
    norm(reel({ ownerUsername: 'b', videoPlayCount: 150000, commentsCount: 1100, reshareCount: 1200, timestamp: ago(30) })),
    norm(car({ ownerUsername: 'c', commentsCount: 9000, reshareCount: 12000 })),
    norm(car({ ownerUsername: 'd', commentsCount: 1200, reshareCount: 1300 })),
    norm(car({ ownerUsername: 'ilia.paliy', commentsCount: 5000, reshareCount: 6000, timestamp: ago(90) }), true),
  ];
  const { list } = candidates(posts, { now: NOW });
  const plan = planDay(list);
  assert.equal(plan.items.length, 3); assert.equal(plan.short, null);
  assert.ok([[1, 2], [2, 1]].some(([r, c]) => plan.mix[0] === r && plan.mix[1] === c));
  const authors = plan.items.filter((x) => !x.own).map((x) => x.author);
  assert.equal(new Set(authors).size, authors.length);
  assert.ok(plan.items.some((x) => x.author === 'a'));       // the strongest reel is in
  assert.ok(plan.items.some((x) => x.author === 'c'));       // the strongest carousel is in
  assert.ok(!plan.items.some((x) => x.author === 'd'));      // the weakest carousel is not
  const text = planText(plan, { date: '06.11.2026', slots: ['10:00', '14:00', '19:00'] });
  assert.match(text, /3 единицы/); assert.match(text, /10:00/);
});

test('план: похожие темы не ставятся в один день', () => {
  const same = 'как заработать первый миллион на нейросетях без вложений пошагово';
  const posts = [norm(reel({ caption: same, ownerUsername: 'x' })), norm(car({ caption: same, ownerUsername: 'y' })),
    norm(car({ ownerUsername: 'z' })), norm(car({ ownerUsername: 'w' }))];
  const plan = planDay(candidates(posts, { now: NOW }).list);
  assert.equal(plan.items.length, 3);
  assert.ok(!(plan.items.some((x) => x.author === 'x') && plan.items.some((x) => x.author === 'y')));
});

test('мало залётов: план честно говорит, чего не хватает, и ниже порогов не берёт', () => {
  const posts = [norm(reel({ ownerUsername: 'a' })), norm(reel({ ownerUsername: 'b' })), norm(car({ ownerUsername: 'c', commentsCount: 50 }))];
  const plan = planDay(candidates(posts, { now: NOW }).list);
  assert.equal(plan.items.length, 2); assert.equal(plan.short.missing, 'каруселей');
  assert.match(planText(plan, { date: 'd', competitors: 2 }), /только на 2/);
});

test('Graph API: настоящие репосты своих постов (поделиться + репосты), карусель ниже порога уходит из библиотеки', async () => {
  const { graphOwn, withGraph, library } = await import('./scout.mjs');
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const u = new URL(url), j = (d) => ({ ok: true, json: async () => d });
    if (u.pathname.endsWith('/me/media')) return j({ data: [{ id: '1', shortcode: 'OWN1', comments_count: 3000, like_count: 10 }, { id: '2', permalink: 'https://www.instagram.com/p/OWN2/', comments_count: 2000 }] });
    const metric = u.searchParams.get('metric'), id = u.pathname.split('/')[2];
    if (metric === 'reposts') return j({ data: [{ name: 'reposts', values: [{ value: id === '1' ? 300 : 0 }] }] });
    return j({ data: [{ name: 'views', values: [{ value: 500000 }] }, { name: 'shares', values: [{ value: id === '1' ? 900 : 200 }] }] });
  };
  const g = await graphOwn({ token: 'IGtok', fetchFn, base: 'https://g' });
  assert.equal(g.get('OWN1').shares, 1200); assert.equal(g.get('OWN2').shares, 200);
  assert.ok(calls[0].startsWith('https://g/v23.0/me/media'));
  const a = norm(reel({ shortCode: 'OWN1', reshareCount: undefined }), true), b = norm(car({ shortCode: 'OWN2', reshareCount: undefined }), true);
  const [ra, rb] = withGraph([a, b], g);
  assert.equal(ra.shares, 1200); assert.equal(ra.graph, true); assert.equal(gate(ra).ok, true);
  assert.equal(rb.shares, 200); assert.equal(gate(rb).ok, false);
  const dir = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/lib-');
  const lib = library(dir);
  lib.add([a, b]);              // without reposts both pass (hidden)
  assert.equal(lib.all().length, 2);
  lib.add([ra, rb]);            // with real reposts the carousel is out
  assert.deepEqual(lib.all().map((x) => x.code), ['OWN1']);
});

test('план: видимые прямые ссылки и отметка «одобрено»', () => {
  const posts = [norm(reel({ ownerUsername: 'a' })), norm(car({ ownerUsername: 'b' })), norm(car({ ownerUsername: 'c' }))];
  const plan = planDay(candidates(posts, { now: NOW }).list);
  plan.items[0].approved = 'x';
  const t = planText(plan, { date: 'd' });
  assert.match(t, /🔗 <a href="https:\/\/www\.instagram\.com\/[^"]+">instagram\.com\/(reel|p)\/[A-Za-z0-9]+<\/a>/);
  assert.match(t, /^✅ 1\./m); assert.match(t, /Одобрено/);
});
