import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import { guardRequest } from '../src/lib/api-guard'

function makeRequest(headers?: Record<string, string>): NextRequest {
  return new Request('http://localhost', { headers }) as unknown as NextRequest
}

describe('api-guard', () => {
  const restoreEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.OWNER_TELEGRAM_ID
    delete process.env.TELEGRAM_REQUIRE_INIT_DATA
  })

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = restoreEnv.TELEGRAM_BOT_TOKEN
    process.env.OWNER_TELEGRAM_ID = restoreEnv.OWNER_TELEGRAM_ID
    process.env.TELEGRAM_REQUIRE_INIT_DATA = restoreEnv.TELEGRAM_REQUIRE_INIT_DATA
  })

  it('allows requests when Telegram auth is disabled', () => {
    const result = guardRequest(makeRequest(), { rateLimit: null })
    expect(result.ok).toBe(true)
  })

  it('rejects owner-only requests without bot token configured', () => {
    const result = guardRequest(makeRequest(), { rateLimit: null, ownerOnly: true })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
    }
  })

  it('requires init data when TELEGRAM_REQUIRE_INIT_DATA is enabled', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_REQUIRE_INIT_DATA = 'true'

    const result = guardRequest(makeRequest(), { rateLimit: null })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
    }
  })
})
