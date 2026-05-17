// Простой in-memory rate limiter. Подходит для одного process'а
// (одного контейнера). Если в будущем будет горизонтальное
// масштабирование — переписать на Redis.

type Bucket = { tokens: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type Limit = { ok: boolean; remaining: number; retryAfterSec: number }

export function rateLimit(key: string, max: number, windowSec: number): Limit {
  const now = Date.now()
  const b = buckets.get(key)

  if (!b || b.resetAt <= now) {
    buckets.set(key, { tokens: max - 1, resetAt: now + windowSec * 1000 })
    return { ok: true, remaining: max - 1, retryAfterSec: 0 }
  }

  if (b.tokens <= 0) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  }

  b.tokens -= 1
  return { ok: true, remaining: b.tokens, retryAfterSec: 0 }
}

// Чистим устаревшие записи раз в 5 минут (defensive, не критично).
if (typeof globalThis !== 'undefined' && !(globalThis as any).__rateCleanup) {
  ;(globalThis as any).__rateCleanup = setInterval(() => {
    const now = Date.now()
    buckets.forEach((b, k) => { if (b.resetAt <= now) buckets.delete(k) })
  }, 5 * 60 * 1000).unref?.()
}
