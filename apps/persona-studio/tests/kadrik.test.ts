// Стили Студии Кадрика: каталог из Creator Pack и клиент API бота (/api/ext/jobs).
// fetch и env подменены — без сети и без Zod-парса env.
import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KADRIK_STYLES, countLabel, findKadrikStyle, kadrikCostFactor, kadrikGroups, kadrikRunnable } from '../src/lib/montage/kadrik-styles.ts';

const fakeEnv = { KADRIK_API_URL: 'https://kadrik.test/', KADRIK_API_KEY: 'k3y' };
mock.module('../src/lib/env.ts', { namedExports: { env: fakeEnv } });

let kadrik: typeof import('../src/lib/montage/kadrik.ts');
before(async () => {
  kadrik = await import('../src/lib/montage/kadrik.ts');
});

test('каталог: 31 стиль мини-аппа Кадрика, id уникальны', () => {
  assert.equal(KADRIK_STYLES.length, 31);
  assert.equal(new Set(KADRIK_STYLES.map((s) => s.id)).size, 31);
  assert.equal(findKadrikStyle('montazh-rils')?.name, 'Палий');
  assert.equal(findKadrikStyle('palii'), undefined);
});

test('каталог: примеры лежат в public/kadrik-styles', () => {
  for (const s of KADRIK_STYLES) {
    for (const f of [s.poster, s.video]) if (f) assert.ok(existsSync(join('public', f)), `${s.id}: нет ${f}`);
  }
});

test('группы витрины: каждый стиль ровно в одной группе, 16:9 — отдельно', () => {
  const groups = kadrikGroups();
  const ids = groups.flatMap((g) => g.styles.map((s) => s.id));
  assert.equal(ids.length, KADRIK_STYLES.length);
  assert.equal(new Set(ids).size, ids.length);
  const long = groups.find((g) => g.key === 'long')!;
  assert.ok(long.styles.every((s) => s.format === '16:9'));
  assert.ok(groups.find((g) => g.key === 'short')!.styles.every((s) => s.format === '9:16'));
});

test('цена и доступность: YouTube ×4, папка футажей — только в Кадрике', () => {
  assert.equal(kadrikCostFactor(findKadrikStyle('educational-youtube-editor')!), 4);
  assert.equal(kadrikCostFactor(findKadrikStyle('montazh-rils-kobalt')!), 1);
  assert.equal(kadrikRunnable(findKadrikStyle('personal-broll-library')!), false);
  assert.equal(kadrikRunnable(findKadrikStyle('watch')!), true);
});

test('countLabel склоняет по-русски', () => {
  const n: [string, string, string] = ['стиль', 'стиля', 'стилей'];
  assert.equal(countLabel(1, n), '1 стиль');
  assert.equal(countLabel(3, n), '3 стиля');
  assert.equal(countLabel(11, n), '11 стилей');
  assert.equal(countLabel(14, n), '14 стилей');
  assert.equal(countLabel(22, n), '22 стиля');
});

test('клиент: Bearer-ключ, адрес без двойного слэша, 4xx — окончательная ошибка', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/bad')) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    if (url.endsWith('/flaky')) return new Response('', { status: 502 });
    return new Response(JSON.stringify({ id: 'j1', status: 'queued', line: '', stage: 0, pos: 2, report: '', result: false }), { status: 200 });
  }) as typeof fetch;
  try {
    const j = await kadrik.createKadrikJob({ skill: 'montazh-rils', source: 'https://s3.test/v.mp4' });
    assert.equal(calls[0].url, 'https://kadrik.test/api/ext/jobs');
    assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer k3y');
    assert.equal(JSON.parse(String(calls[0].init.body)).skill, 'montazh-rils');
    assert.equal(kadrik.kadrikProgress(j), 'в очереди Кадрика · 2-я');

    await assert.rejects(kadrik.getKadrikJob('bad'), (e: InstanceType<typeof kadrik.KadrikError>) => e.final && e.message === 'not found');
    await assert.rejects(kadrik.getKadrikJob('flaky'), (e: InstanceType<typeof kadrik.KadrikError>) => !e.final);
  } finally {
    globalThis.fetch = orig;
  }
});

test('прогресс: этап и последняя строка Claude', () => {
  const p = kadrik.kadrikProgress({ id: 'x', status: 'processing', line: 'рендерю сцену 4', stage: 4, pos: 0, report: '', result: false });
  assert.equal(p, 'рендер · рендерю сцену 4');
});
