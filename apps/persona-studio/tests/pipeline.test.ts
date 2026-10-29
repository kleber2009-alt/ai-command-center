// REEL branch: HeyGen account listing (mapping, sorting, pagination + cache),
// the v3 look-video body, pipeline stage derivation and script clean-up.
// Network, env and storage are mocked — no real HeyGen / Claude / S3.
import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('../src/lib/env.ts', { namedExports: { env: { ANTHROPIC_DEEP_MODEL: 'm', OPENAI_API_KEY: '' } } });
mock.module('../src/lib/storage.ts', { namedExports: { fetchMedia: () => { throw new Error('no network'); } } });
mock.module('../src/lib/research/claude.ts', { namedExports: { claudeChat: async () => ({ ok: false, status: 0, details: '' }) } });
mock.module('../src/lib/research/transcribe.ts', { namedExports: { transcribeReel: async () => ({ ok: false, error: 'x' }) } });
mock.module('../src/lib/studio/similarity.ts', { namedExports: { checkSimilarity: async () => ({ similarity: null, gate: 'pass' }) } });

let acc: typeof import('../src/lib/heygen-account.ts');
let heygen: typeof import('../src/lib/heygen.ts');
let stage: typeof import('../src/lib/pipeline/stage.ts');
let script: typeof import('../src/lib/pipeline/script.ts');

before(async () => {
  acc = await import('../src/lib/heygen-account.ts');
  heygen = await import('../src/lib/heygen.ts');
  stage = await import('../src/lib/pipeline/stage.ts');
  script = await import('../src/lib/pipeline/script.ts');
});

// Shapes copied from the real GET /v3/avatars/looks response (2026-10-29).
const LOOK_TWIN = {
  avatar_type: 'digital_twin',
  gender: 'unknown',
  group_id: '2c7ab21db7924174b10423bfba6b9583',
  id: '025cc7689ced4904b311c9a0829bf4ab',
  name: 'Ilia Paliy',
  preferred_orientation: 'portrait',
  preview_image_url: 'https://resource2.heygen.ai/x.jpg',
  preview_video_url: 'https://resource2.heygen.ai/x.mp4',
  status: 'completed',
  supported_api_engines: ['avatar_v', 'avatar_iv', 'avatar_iii'],
  default_voice_id: 'a18b77c30b944eb09f9e3d98eddd37c3',
  tags: [],
};

test('mapLook: compact item, best engine, type label', () => {
  const a = acc.mapLook(LOOK_TWIN, true)!;
  assert.equal(a.id, LOOK_TWIN.id);
  assert.equal(a.type, 'digital_twin');
  assert.equal(a.typeLabel, 'Цифровой двойник');
  assert.equal(a.engine, 'avatar_v');
  assert.deepEqual(a.engines, ['avatar_v', 'avatar_iv', 'avatar_iii']);
  assert.equal(a.gender, null); // 'unknown' dropped
  assert.equal(a.orientation, 'portrait');
  assert.equal(a.private, true);
});

test('mapLook: private look still processing is hidden; unknown engines ignored', () => {
  assert.equal(acc.mapLook({ ...LOOK_TWIN, status: 'processing' }, true), null);
  assert.equal(acc.mapLook({ ...LOOK_TWIN, id: undefined }, true), null);
  const iv = acc.mapLook({ ...LOOK_TWIN, supported_api_engines: ['foo', 'avatar_iv'] }, false)!;
  assert.equal(iv.engine, 'avatar_iv');
  assert.equal(acc.pickEngine(['avatar_iii']), 'avatar_iii');
  assert.equal(acc.pickEngine([]), null);
});

test('normalizeLang handles HeyGen variants', () => {
  assert.equal(acc.normalizeLang('Russian'), 'ru');
  assert.equal(acc.normalizeLang('ru'), 'ru');
  assert.equal(acc.normalizeLang('en-US'), 'en');
  assert.equal(acc.normalizeLang('unknown'), '');
  assert.equal(acc.normalizeLang(null), '');
});

test('sortVoices: private clones first, then Russian, deduped', () => {
  const v = (id: string, name: string, lang: string, p: boolean) => acc.mapVoice({ voice_id: id, name, language: lang, gender: 'male' }, p)!;
  const out = acc.sortVoices([
    v('1', 'Bob', 'English', false),
    v('2', 'Вадим', 'Russian', false),
    v('3', 'ilia.paliy', 'English', true),
    v('4', 'ilia.paliy -- 50', 'Russian', true),
    v('2', 'Вадим', 'Russian', false),
    v('5', 'Any', 'Multilingual', false),
  ]);
  assert.deepEqual(out.map((x) => x.id), ['4', '3', '2', '5', '1']);
});

test('listHeygenAvatars: follows next_token, keeps private first, caches 5 min', async () => {
  process.env.HEYGEN_API_KEY = 'k';
  process.env.HEYGEN_API_BASE = 'https://hg.test';
  acc._clearHeygenAccountCache();
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push(String(url));
    assert.equal((init.headers as Record<string, string>)['X-Api-Key'], 'k');
    const u = new URL(String(url));
    if (u.searchParams.get('ownership') === 'public') {
      return new Response(JSON.stringify({ data: [{ ...LOOK_TWIN, id: 'pub', name: 'Dante' }], has_more: true, next_token: 'z' }));
    }
    if (!u.searchParams.get('token')) {
      return new Response(JSON.stringify({ data: [LOOK_TWIN], has_more: true, next_token: 't2' }));
    }
    return new Response(JSON.stringify({ data: [{ ...LOOK_TWIN, id: 'b', avatar_type: 'photo_avatar' }], has_more: false, next_token: null }));
  });
  try {
    const own = await acc.listHeygenAvatars();
    assert.deepEqual(own.map((a) => a.id), [LOOK_TWIN.id, 'b']);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes('token=t2'));
    await acc.listHeygenAvatars(); // cached
    assert.equal(calls.length, 2);
    const all = await acc.listHeygenAvatars({ includePublic: true });
    assert.deepEqual(all.map((a) => [a.id, a.private]), [[LOOK_TWIN.id, true], ['b', true], ['pub', false]]);
    assert.equal(calls.length, 5); // 2 private + 1 public page (public capped at one page)
  } finally {
    fetchMock.mock.restore();
  }
});

test('listHeygenAvatars: HTTP error surfaces as HeygenError', async () => {
  acc._clearHeygenAccountCache();
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{"error":"bad key"}', { status: 401 }));
  try {
    await assert.rejects(acc.listHeygenAvatars({ fresh: true }), (e: Error) => e.name === 'HeygenError' && /LIST_HTTP_401/.test((e as { code?: string }).code ?? ''));
  } finally {
    fetchMock.mock.restore();
  }
});

test('buildV3LookVideoBody: look id as avatar_id, engine, 1080p, script cap', () => {
  const b = heygen.buildV3LookVideoBody({ lookId: 'L', voiceId: 'V', script: 'x'.repeat(2000), engine: 'avatar_iv', aspect: '9:16', title: 'persona-1' });
  assert.equal(b.type, 'avatar');
  assert.equal(b.avatar_id, 'L');
  assert.equal(b.voice_id, 'V');
  assert.equal((b.script as string).length, 1500);
  assert.equal(b.resolution, '1080p');
  assert.equal(b.aspect_ratio, '9:16');
  assert.deepEqual(b.engine, { type: 'avatar_iv' });
  assert.equal(b.title, 'persona-1');
  assert.equal('motion_prompt' in b, false);
});

const base = { kind: 'reel', stage: 'source', script: null, montageStyle: null } as const;

test('deriveStage: reel walk-through', () => {
  const d = stage.deriveStage;
  assert.equal(d({ ...base }).stage, 'source');
  assert.equal(d({ ...base, script: 'hello' }).stage, 'script');
  assert.equal(d({ ...base, script: 's', video: { status: 'processing' } }).stage, 'video');
  assert.equal(d({ ...base, script: 's', video: { status: 'completed' } }).stage, 'montage');
  assert.equal(d({ ...base, script: 's', montageStyle: 'none', video: { status: 'completed' } }).stage, 'ready');
  assert.equal(d({ ...base, script: 's', video: { status: 'completed' }, montage: { status: 'processing' } }).stage, 'montage');
  assert.equal(d({ ...base, script: 's', video: { status: 'completed' }, montage: { status: 'completed' } }).stage, 'ready');
  assert.equal(d({ ...base, script: 's', video: { status: 'completed' }, post: { status: 'scheduled' } }).stage, 'scheduled');
  assert.equal(d({ ...base, script: 's', video: { status: 'completed' }, post: { status: 'published' } }).stage, 'published');
});

test('deriveStage: failures give a readable Russian message', () => {
  const v = stage.deriveStage({ ...base, script: 's', video: { status: 'failed', errorMsg: 'HEYGEN_LIMIT: На API-балансе HeyGen закончились кредиты, токены возвращены.' } });
  assert.equal(v.stage, 'error');
  assert.match(v.errorMsg ?? '', /закончились кредиты/);
  const raw = stage.deriveStage({ ...base, script: 's', video: { status: 'failed', errorMsg: 'V3_VIDEO_HTTP_500: {"x":1}' } });
  assert.match(raw.errorMsg ?? '', /не получилось/i); // raw provider JSON never shown
  const m = stage.deriveStage({ ...base, script: 's', video: { status: 'completed' }, montage: { status: 'failed', errorMsg: 'boom' } });
  assert.equal(m.stage, 'error');
  assert.match(m.errorMsg ?? '', /Монтаж/);
  const p = stage.deriveStage({ ...base, script: 's', video: { status: 'completed' }, post: { status: 'failed' } });
  assert.equal(p.stage, 'error');
  // canceled post → back to ready
  assert.equal(stage.deriveStage({ ...base, script: 's', montageStyle: 'none', video: { status: 'completed' }, post: { status: 'canceled' } }).stage, 'ready');
});

test('deriveStage: carousel keeps its stored stage until a post exists', () => {
  assert.equal(stage.deriveStage({ kind: 'carousel', stage: 'ready', script: null, montageStyle: null }).stage, 'ready');
  assert.equal(stage.deriveStage({ kind: 'carousel', stage: 'ready', script: null, montageStyle: null, post: { status: 'published' } }).stage, 'published');
  assert.equal(stage.deriveStage({ kind: 'carousel', stage: 'scheduled', script: null, montageStyle: null }).stage, 'ready');
});

test('cleanScript strips labels, timecodes and fences', () => {
  const out = script.cleanScript('```\nСценарий: [ХУК] Привет!\n0:00–0:03 Это я.\n\n\n\n[CTA] Пиши «ГАЙД».\n```');
  assert.equal(out, 'Привет!\nЭто я.\n\nПиши «ГАЙД».');
});

test('buildUniquifySystem: length from the source, strict retry, persona tone', () => {
  const sys = script.buildUniquifySystem({ name: '@ilia.paliy', lang: 'ru', examples: ['я так говорю'], taboo: ['кринж'] }, { targetSec: 30 });
  assert.match(sys, /~30 сек/);
  assert.match(sys, /@ilia\.paliy/);
  assert.match(sys, /я так говорю/);
  assert.match(sys, /кринж/);
  assert.doesNotMatch(sys, /слишком похож/);
  assert.match(script.buildUniquifySystem({ name: 'a', lang: 'ru', examples: [], taboo: [] }, { strict: true }), /слишком похож/);
});
