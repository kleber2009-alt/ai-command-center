import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight in-memory rate limiter for public endpoints (abuse protection of
 * the anonymous funnel / auth — spec §5 security). Fixed-window per IP+bucket.
 *
 * NOTE: in-memory state is per-instance. The backend runs as a single container
 * (cdd-backend), so this is sufficient; for multi-instance deployments back it
 * with Redis instead.
 */
interface Window { count: number; resetAt: number }
const store = new Map<string, Window>();

// Opportunistic cleanup so the map can't grow unbounded.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, w] of store) if (w.resetAt < now) store.delete(k);
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Returns true if the request is allowed, false if the limit is exceeded. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const w = store.get(key);
  if (!w || w.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (w.count >= limit) return false;
  w.count++;
  return true;
}

/**
 * Guard helper for route handlers:
 *   const limited = guardRate(req, 'leads', 10, 60_000);
 *   if (limited) return limited;
 */
export function guardRate(req: NextRequest, bucket: string, limit: number, windowMs: number): NextResponse | null {
  const key = `${bucket}:${clientIp(req)}`;
  if (allow(key, limit, windowMs)) return null;
  return NextResponse.json(
    { ok: false, error: { message: 'too many requests', code: 'RATE_LIMITED' } },
    { status: 429, headers: { 'retry-after': String(Math.ceil(windowMs / 1000)) } },
  );
}
