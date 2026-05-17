// Server-side verification of Telegram WebApp `initData`.
//
// Per the official spec
// (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//
//   secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
//   check_hash = HMAC_SHA256(key=secret_key, message=data_check_string)
//   data_check_string = sorted "key=value" pairs joined by "\n",
//                       excluding the "hash" field itself.
//
// Uses Web Crypto API (`crypto.subtle`) so it runs in both the Edge
// runtime (middleware) and Node.js runtime (route handlers).

const MAX_AGE_SECONDS = 24 * 60 * 60 // 24h — Telegram-recommended default

export type TelegramInitDataVerification =
  | { ok: true; userId: number; username?: string; authDate: number }
  | { ok: false; reason: string }

export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<TelegramInitDataVerification> {
  if (!initData) return { ok: false, reason: 'empty initData' }
  if (!botToken) return { ok: false, reason: 'no bot token configured' }

  // initData is URL-encoded form, e.g. "user=%7B...%7D&auth_date=123&hash=abcdef"
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'missing hash' }

  // Build data_check_string: every k=v pair except `hash`, sorted by key,
  // joined by "\n". Values are NOT re-encoded — use the raw decoded form.
  const pairs: string[] = []
  params.forEach((v, k) => {
    if (k === 'hash') return
    pairs.push(`${k}=${v}`)
  })
  pairs.sort()
  const dataCheckString = pairs.join('\n')

  // Compute the expected hash.
  const secret = new Uint8Array(
    await hmacSha256(strToBytes('WebAppData'), strToBytes(botToken)),
  )
  const computed = new Uint8Array(
    await hmacSha256(secret, strToBytes(dataCheckString)),
  )
  const expectedHex = bytesToHex(computed)

  if (!timingSafeEqualHex(expectedHex, hash)) {
    return { ok: false, reason: 'hash mismatch' }
  }

  // Reject ancient initData — protects against replay if someone leaks one.
  const authDate = Number(params.get('auth_date') || '0')
  if (!authDate || now - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'initData expired' }
  }

  // Extract user id for downstream logging / rate limiting.
  let userId = 0
  let username: string | undefined
  const userJson = params.get('user')
  if (userJson) {
    try {
      const user = JSON.parse(userJson)
      userId = Number(user.id) || 0
      if (typeof user.username === 'string') username = user.username
    } catch {
      return { ok: false, reason: 'user JSON malformed' }
    }
  }

  return { ok: true, userId, username, authDate }
}

async function hmacSha256(keyBytes: Uint8Array, msg: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', key, msg as BufferSource)
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
