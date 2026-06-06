// Unit tests for the rate limiter. rateLimit() takes an injectable RedisLike,
// so we drive it with an in-memory fake — no Redis, no module mocking.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rateLimit, type RedisLike } from '../src/lib/ratelimit.ts';

// In-memory fake: counts INCRs per key, records expire calls, fixed ttl.
function fakeRedis(opts: { throwOnIncr?: boolean } = {}) {
  const counts = new Map<string, number>();
  const expires: Array<{ key: string; sec: number }> = [];
  const redis: RedisLike = {
    async incr(key) {
      if (opts.throwOnIncr) throw new Error('redis down');
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    async expire(key, sec) {
      expires.push({ key, sec });
    },
    async ttl() {
      return 42;
    },
  };
  return { redis, expires };
}

test('allows requests under the limit and counts down remaining', async () => {
  const { redis } = fakeRedis();
  const r1 = await rateLimit('k', 3, 60, redis);
  assert.deepEqual([r1.ok, r1.remaining], [true, 2]);
  const r2 = await rateLimit('k', 3, 60, redis);
  assert.deepEqual([r2.ok, r2.remaining], [true, 1]);
});

test('allows the request exactly at the limit, blocks the next', async () => {
  const { redis } = fakeRedis();
  await rateLimit('k', 2, 60, redis); // 1
  const atLimit = await rateLimit('k', 2, 60, redis); // 2 == limit
  assert.equal(atLimit.ok, true);
  assert.equal(atLimit.remaining, 0);
  const over = await rateLimit('k', 2, 60, redis); // 3 > limit
  assert.equal(over.ok, false);
  assert.equal(over.remaining, 0);
  assert.equal(over.resetSec, 42); // surfaced from ttl
});

test('sets the window TTL only on the first hit', async () => {
  const { redis, expires } = fakeRedis();
  await rateLimit('k', 5, 60, redis);
  await rateLimit('k', 5, 60, redis);
  await rateLimit('k', 5, 60, redis);
  assert.equal(expires.length, 1, 'expire must be called once per window');
  assert.equal(expires[0].sec, 60);
});

test('separate keys have independent windows', async () => {
  const { redis } = fakeRedis();
  await rateLimit('a', 1, 60, redis); // a: 1
  const aOver = await rateLimit('a', 1, 60, redis); // a: 2 > 1
  const b = await rateLimit('b', 1, 60, redis); // b: 1
  assert.equal(aOver.ok, false);
  assert.equal(b.ok, true);
});

test('fails open when Redis errors (never blocks paying users on infra hiccup)', async () => {
  const { redis } = fakeRedis({ throwOnIncr: true });
  const r = await rateLimit('k', 1, 60, redis);
  assert.equal(r.ok, true);
  assert.equal(r.remaining, r.limit);
});
