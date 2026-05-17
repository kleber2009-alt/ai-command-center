// In-memory sliding-window rate limiter, keyed per (IP, route).
//
// Scoped to a single Next.js process — on Vercel each lambda
// instance has its own counter, so the effective limit per IP is
// `max * instance_count`. Good enough as a defence against
// accidental scrape / burst; not a substitute for a real WAF.
// Counters reset on process restart.

interface Bucket {
  // Timestamps (ms) of recent hits, oldest first.
  hits: number[];
}

const buckets = new Map<string, Bucket>();

// Purge stale buckets so the Map doesn't grow unboundedly under
// long-running processes. Runs at most once per minute.
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000;

function maybeSweep(now: number, maxWindowMs: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  buckets.forEach((bucket, key) => {
    bucket.hits = bucket.hits.filter((t: number) => now - t < maxWindowMs);
    if (bucket.hits.length === 0) buckets.delete(key);
  });
}

export interface RateLimitOk {
  ok: true;
  remaining: number;
}

export interface RateLimitDenied {
  ok: false;
  retryAfter: number; // seconds until next allowed request
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitOk | RateLimitDenied {
  const now = Date.now();
  maybeSweep(now, windowMs);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0];
    const retryAfterMs = windowMs - (now - oldest);
    return { ok: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  bucket.hits.push(now);
  return { ok: true, remaining: max - bucket.hits.length };
}

// Extract the caller's IP from request headers. On Vercel /
// behind any sane reverse proxy, x-forwarded-for is set.
// Fall back to x-real-ip, then to a constant — so misconfigured
// deploys still rate-limit globally rather than allow unlimited.
export function ipFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}
