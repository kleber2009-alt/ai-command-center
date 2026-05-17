type Bucket = { timestamps: number[] }

const store = new Map<string, Bucket>()

function cleanup(now: number, windowMs: number) {
  if (store.size < 1000) return
  store.forEach((b, k) => {
    const fresh = b.timestamps.filter((t: number) => now - t < windowMs)
    if (fresh.length === 0) store.delete(k)
    else b.timestamps = fresh
  })
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = store.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs)
  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0]
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) }
  }
  bucket.timestamps.push(now)
  store.set(key, bucket)
  cleanup(now, windowMs)
  return { ok: true }
}
