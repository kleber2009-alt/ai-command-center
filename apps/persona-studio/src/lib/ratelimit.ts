// Redis fixed-window rate limiting for expensive endpoints.
//
// Why: research/search hits Apify (real $ per call) and the generate-* routes
// drive paid providers. Token balance caps spend, but a hot loop or a leaked
// API key can still burn the Apify budget or hammer providers. This adds a
// per-user (and per-channel: web vs API) ceiling.
//
// Design: fixed window via INCR + EXPIRE — atomic enough, O(1), no ZSET. Fails
// OPEN: if Redis is unreachable we allow the request rather than block paying
// users on an infra hiccup (the Apify monthly cap is the backstop for cost).
//
// `next/server` is imported lazily inside enforceRateLimit so the pure
// rateLimit() stays unit-testable with just tsx (no Next, no Redis).
import IORedis from 'ioredis';

export type RateResult = { ok: boolean; limit: number; remaining: number; resetSec: number };

// Minimal surface we need from a Redis client — lets tests inject a fake.
export type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, sec: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
};

let _redis: IORedis | null = null;
function getRedis(): RedisLike {
  if (_redis) return _redis;
  _redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379/3', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  return _redis;
}

/**
 * Increment the counter for `key` in the current `windowSec` window and report
 * whether the caller is within `limit`. Fails open on any Redis error.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  redis: RedisLike = getRedis(),
): Promise<RateResult> {
  const windowId = Math.floor(Date.now() / 1000 / windowSec);
  const bucketKey = `rl:${key}:${windowId}`;
  try {
    const count = await redis.incr(bucketKey);
    if (count === 1) await redis.expire(bucketKey, windowSec);
    const ttl = await redis.ttl(bucketKey);
    const resetSec = ttl > 0 ? ttl : windowSec;
    return { ok: count <= limit, limit, remaining: Math.max(0, limit - count), resetSec };
  } catch {
    return { ok: true, limit, remaining: limit, resetSec: windowSec };
  }
}

// Per-bucket limits (requests per minute), env-overridable. research is the
// strictest because it spends Apify budget on uncached searches.
const BUCKETS: Record<string, number> = {
  'research-search': Number(process.env.RATELIMIT_RESEARCH_PER_MIN ?? 10),
  generate: Number(process.env.RATELIMIT_GENERATE_PER_MIN ?? 20),
};
const WINDOW_SEC = 60;

type AuthCtx = { user: { id: string }; viaApiKey?: boolean };

/**
 * Enforce the limit for `bucket` against the authenticated subject. Returns a
 * ready-to-return 429 NextResponse when exceeded, or null when allowed.
 *
 * Web sessions and API keys get separate windows so API traffic can't lock a
 * user out of the UI (and vice versa).
 */
export async function enforceRateLimit(ctx: AuthCtx, bucket: keyof typeof BUCKETS) {
  const limit = BUCKETS[bucket];
  const channel = ctx.viaApiKey ? 'api' : 'web';
  const res = await rateLimit(`${bucket}:${channel}:${ctx.user.id}`, limit, WINDOW_SEC);
  if (res.ok) return null;
  const { NextResponse } = await import('next/server');
  return NextResponse.json(
    { error: 'rate_limited', detail: `Too many requests. Retry in ${res.resetSec}s.`, retryAfter: res.resetSec },
    {
      status: 429,
      headers: {
        'Retry-After': String(res.resetSec),
        'X-RateLimit-Limit': String(res.limit),
        'X-RateLimit-Remaining': String(res.remaining),
      },
    },
  );
}
