// Edge-safe Telegram initData verifier and Basic Auth check.
// Uses Web Crypto (SubtleCrypto) instead of node:crypto so the same
// helpers run unchanged inside Next.js middleware.

export type TelegramAuthResult =
  | { ok: true; userId: number | null; username: string | null; authDate: number }
  | { ok: false; reason: string }

const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 days
const enc = new TextEncoder()

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    // Slice into a plain ArrayBuffer to satisfy strict BufferSource typings.
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  )
  return new Uint8Array(sig)
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16)
    out += h.length === 1 ? '0' + h : h
  }
  return out
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyTelegramInitData(
  initData: string | null | undefined,
  botToken: string | undefined,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
): Promise<TelegramAuthResult> {
  if (!botToken) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN не настроен на сервере' }
  if (!initData) return { ok: false, reason: 'нет initData' }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'нет hash в initData' }
  params.delete('hash')

  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  // Two-step HMAC per Telegram spec:
  //   secret = HMAC_SHA256("WebAppData", bot_token)
  //   sig    = HMAC_SHA256(secret, data_check_string)
  const secret = await hmacSha256(enc.encode('WebAppData'), enc.encode(botToken))
  const sig = await hmacSha256(secret, enc.encode(checkString))
  const computed = toHex(sig)

  if (!constantTimeEqualHex(computed, hash)) {
    return { ok: false, reason: 'неверная подпись' }
  }

  const authDate = Number(params.get('auth_date') ?? 0)
  if (!authDate) return { ok: false, reason: 'нет auth_date' }
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
    return { ok: false, reason: `сессия старше ${maxAgeSeconds}с` }
  }

  let userId: number | null = null
  let username: string | null = null
  const userJson = params.get('user')
  if (userJson) {
    try {
      const user = JSON.parse(userJson)
      if (typeof user.id === 'number') userId = user.id
      if (typeof user.username === 'string') username = user.username
    } catch {
      // ignore
    }
  }
  return { ok: true, userId, username, authDate }
}

// Edge-safe Basic Auth comparison. Uses base64 via globalThis.atob
// (always present in Edge and modern Node) and a constant-time string
// compare.
export function verifyBasicAuth(
  authHeader: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return false
  if (!authHeader || !authHeader.startsWith('Basic ')) return false
  let decoded: string
  try {
    decoded = atob(authHeader.slice(6))
  } catch {
    return false
  }
  if (decoded.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < decoded.length; i++) {
    diff |= decoded.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
