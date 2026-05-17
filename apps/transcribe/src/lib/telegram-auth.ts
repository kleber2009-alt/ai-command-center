// HMAC-SHA256 verification of Telegram.WebApp.initData. Algorithm
// from https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// 1. Pull `hash` out of the urlencoded initData string.
// 2. Build data_check_string: every remaining `key=value` pair
//    joined with \n, sorted by key.
// 3. secret_key = HMAC-SHA256(key="WebAppData", msg=bot_token)
// 4. expected_hash = hex(HMAC-SHA256(key=secret_key, msg=data_check_string))
// 5. timing-safe-compare expected_hash to the `hash` from step 1
//
// If anything fails (missing fields, bad hash, stale auth_date)
// the function returns null. Caller decides whether to allow or
// reject — by default, only routes opting in via api-guard care.

import crypto from 'node:crypto'

export interface VerifiedInitData {
  user?: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
    language_code?: string
  }
  auth_date: number
  query_id?: string
}

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60

export function verifyInitData(
  initData: string | null | undefined,
  botToken: string | null | undefined,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): VerifiedInitData | null {
  if (!initData || !botToken) return null

  const params = new URLSearchParams(initData)
  const givenHash = params.get('hash')
  if (!givenHash) return null

  params.delete('hash')

  // Telegram requires sorted-by-key joined by \n. URLSearchParams
  // preserves insertion order, so we read entries and sort.
  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHashHex = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  // timing-safe compare — both sides must be the same length and Buffer-shape.
  let expected: Buffer
  let actual: Buffer
  try {
    expected = Buffer.from(expectedHashHex, 'hex')
    actual = Buffer.from(givenHash, 'hex')
  } catch {
    return null
  }
  if (expected.length !== actual.length) return null
  if (!crypto.timingSafeEqual(expected, actual)) return null

  // Optional staleness check. Telegram includes auth_date as a
  // unix timestamp; we reject anything older than maxAgeSeconds.
  const authDateRaw = params.get('auth_date')
  const authDate = authDateRaw ? parseInt(authDateRaw, 10) : 0
  if (!authDate || !Number.isFinite(authDate)) return null
  const nowSec = Math.floor(Date.now() / 1000)
  if (nowSec - authDate > maxAgeSeconds) return null

  // Parse user blob. It's a JSON string inside the urlencoded form.
  let user: VerifiedInitData['user']
  const userStr = params.get('user')
  if (userStr) {
    try {
      const parsed = JSON.parse(userStr)
      if (parsed && typeof parsed.id === 'number') {
        user = {
          id: parsed.id,
          first_name: parsed.first_name,
          last_name: parsed.last_name,
          username: parsed.username,
          language_code: parsed.language_code,
        }
      }
    } catch {
      // Bad user JSON — still accept the initData, just without user.
    }
  }

  return {
    user,
    auth_date: authDate,
    query_id: params.get('query_id') || undefined,
  }
}
