import { createHmac, timingSafeEqual } from 'crypto'

export type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export type VerifyResult = { ok: true; user?: TelegramUser } | { ok: false; reason: string }

const MAX_AGE_SECONDS = 24 * 60 * 60

export function verifyTelegramInitData(initData: string, botToken: string): VerifyResult {
  if (!initData) return { ok: false, reason: 'no init data' }
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'no hash' }
  params.delete('hash')

  const entries: [string, string][] = []
  params.forEach((value, key) => entries.push([key, value]))
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n')

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  if (computed.length !== hash.length) return { ok: false, reason: 'hash length mismatch' }
  if (!timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))) {
    return { ok: false, reason: 'hash mismatch' }
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10)
  if (!authDate) return { ok: false, reason: 'no auth_date' }
  if (Math.abs(Date.now() / 1000 - authDate) > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'init data expired' }
  }

  let user: TelegramUser | undefined
  const userJson = params.get('user')
  if (userJson) {
    try {
      user = JSON.parse(userJson) as TelegramUser
    } catch {}
  }
  return { ok: true, user }
}
