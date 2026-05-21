import { getDb } from './db'

export type UserTier = 'free' | 'pro' | 'team'

export type AppUser = {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  subscription_tier: UserTier
  subscription_expires_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export type QuotaInfo = {
  minutes_used: number
  minutes_limit: number  // -1 means unlimited
  resets_at: string
}

// Downgrade Pro/Team users whose subscription_expires_at < now.
// Mutates the row in DB and the in-memory user object.
async function downgradeIfExpired(db: ReturnType<typeof getDb>, user: AppUser): Promise<AppUser> {
  if (!db) return user
  if (user.subscription_tier === 'free') return user
  if (!user.subscription_expires_at) return user
  if (new Date(user.subscription_expires_at) >= new Date()) return user

  try {
    await db`
      UPDATE users
         SET subscription_tier = 'free', updated_at = NOW()
       WHERE id = ${user.id}::uuid
    `
    user.subscription_tier = 'free'
  } catch (e: any) {
    console.warn('[users-db] downgradeIfExpired failed:', e?.message)
  }
  return user
}

export async function getOrCreateUser(tg: {
  id: number
  username?: string
  first_name?: string
}): Promise<AppUser | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`
      INSERT INTO users (telegram_id, username, first_name, updated_at)
      VALUES (${tg.id}, ${tg.username ?? null}, ${tg.first_name ?? null}, NOW())
      ON CONFLICT (telegram_id) DO UPDATE
        SET username   = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            updated_at = NOW()
      RETURNING *
    `
    return await downgradeIfExpired(db, row as AppUser)
  } catch (e: any) {
    console.warn('[users-db] getOrCreateUser failed:', e?.message)
    return null
  }
}

export async function getUserByTelegramId(telegramId: number): Promise<AppUser | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`SELECT * FROM users WHERE telegram_id = ${telegramId}`
    if (!row) return null
    return await downgradeIfExpired(db, row as AppUser)
  } catch (e: any) {
    console.warn('[users-db] getUserByTelegramId failed:', e?.message)
    return null
  }
}

export async function getQuota(userId: string, tier: UserTier): Promise<QuotaInfo | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`SELECT * FROM ensure_quota(${userId}::uuid, ${tier}::text)`
    if (!row) return null
    return {
      minutes_used: Number((row as any).minutes_used),
      minutes_limit: Number((row as any).minutes_limit),
      resets_at: String((row as any).resets_at),
    } as QuotaInfo
  } catch (e: any) {
    console.warn('[users-db] getQuota failed:', e?.message)
    return null
  }
}

export async function deductMinutes(userId: string, minutes: number): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    await db`SELECT add_minutes_used(${userId}::uuid, ${minutes}::numeric)`
  } catch (e: any) {
    console.warn('[users-db] deductMinutes failed:', e?.message)
  }
}

export async function updateUserStripe(
  userId: string,
  updates: {
    stripe_customer_id?: string
    stripe_subscription_id?: string | null
    subscription_tier?: UserTier
  },
): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    const vals: Record<string, unknown> = { updated_at: new Date() }
    if (updates.stripe_customer_id !== undefined) vals.stripe_customer_id = updates.stripe_customer_id
    if (updates.stripe_subscription_id !== undefined) vals.stripe_subscription_id = updates.stripe_subscription_id
    if (updates.subscription_tier !== undefined) vals.subscription_tier = updates.subscription_tier
    await db`UPDATE users SET ${db(vals)} WHERE id = ${userId}::uuid`
  } catch (e: any) {
    console.warn('[users-db] updateUserStripe failed:', e?.message)
  }
}

export async function getUserByStripeCustomer(customerId: string): Promise<AppUser | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`SELECT * FROM users WHERE stripe_customer_id = ${customerId}`
    return (row as AppUser) ?? null
  } catch {
    return null
  }
}

// Telegram Stars billing
// -----------------------

// Extends the user's Pro subscription by `days` from MAX(now, current_expiry).
// Returns the new expiry timestamp (ISO string).
export async function grantProDays(userId: string, days: number): Promise<string | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`SELECT grant_pro_days(${userId}::uuid, ${days}::int) AS new_expires`
    return (row as any)?.new_expires?.toISOString?.() ?? (row as any)?.new_expires ?? null
  } catch (e: any) {
    console.error('[users-db] grantProDays failed:', e?.message)
    return null
  }
}

export async function recordStarsPayment(p: {
  userId: string
  telegramPaymentChargeId: string
  providerPaymentChargeId?: string | null
  starsAmount: number
  tier: UserTier
  daysGranted: number
  payload?: unknown
}): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    await db`
      INSERT INTO stars_payments (
        user_id, telegram_payment_charge_id, provider_payment_charge_id,
        stars_amount, tier, days_granted, payload
      ) VALUES (
        ${p.userId}::uuid, ${p.telegramPaymentChargeId}, ${p.providerPaymentChargeId ?? null},
        ${p.starsAmount}, ${p.tier}, ${p.daysGranted}, ${p.payload ? JSON.stringify(p.payload) : null}::jsonb
      )
      ON CONFLICT (telegram_payment_charge_id) DO NOTHING
    `
  } catch (e: any) {
    console.error('[users-db] recordStarsPayment failed:', e?.message)
  }
}

// --- Admin / owner-only operations ----------------------------------------

export type AdminUserRow = {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  subscription_tier: UserTier
  created_at: string
  minutes_used: number | null
  minutes_limit: number | null
  resets_at: string | null
}

export async function adminListUsers(): Promise<AdminUserRow[]> {
  const db = getDb()
  if (!db) return []
  try {
    return (await db`
      SELECT
        u.id, u.telegram_id, u.username, u.first_name, u.subscription_tier, u.created_at,
        q.minutes_used, q.minutes_limit, q.resets_at
      FROM users u
      LEFT JOIN user_quotas q ON q.user_id = u.id
      ORDER BY u.created_at DESC
    `) as AdminUserRow[]
  } catch (e: any) {
    console.warn("[users-db] adminListUsers failed:", e?.message)
    return []
  }
}

export async function adminAddMinutes(userId: string, delta: number): Promise<number | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`
      UPDATE user_quotas
      SET minutes_limit = minutes_limit + ${delta}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
      RETURNING minutes_limit
    `
    return row ? Number(row.minutes_limit) : null
  } catch (e: any) {
    console.warn("[users-db] adminAddMinutes failed:", e?.message)
    return null
  }
}

export async function adminGrantMinutesByTelegramId(
  telegramId: number,
  delta: number,
  tier: UserTier = "pro",
): Promise<{ userId: string; minutesLimit: number } | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [u] = await db`
      INSERT INTO users (telegram_id, subscription_tier, updated_at)
      VALUES (${telegramId}, ${tier}, NOW())
      ON CONFLICT (telegram_id) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `
    if (!u) return null
    const userId = u.id as string
    await db`SELECT ensure_quota(${userId}::uuid, ${tier}::text)`
    const [q] = await db`
      UPDATE user_quotas
      SET minutes_limit = minutes_limit + ${delta}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
      RETURNING minutes_limit
    `
    return { userId, minutesLimit: q ? Number(q.minutes_limit) : 0 }
  } catch (e: any) {
    console.warn("[users-db] adminGrantMinutesByTelegramId failed:", e?.message)
    return null
  }
}

// ─── clone-flow draft state ────────────────────────────────────────
// Хранит «между сообщениями» состояние /clone-сценария: ждём ли мы
// фото от юзера, имя для только что отправленного фото, и какой
// source_url/competitor нужно запустить когда фото будет готово.

export type CloneDraft = {
  telegram_user_id: number
  chat_id: number
  source_url: string | null
  competitor_account: string | null
  state: 'awaiting_photo_choice' | 'awaiting_photo' | 'awaiting_name'
  photo_id: number | null
  pending_file_id: string | null
}

export async function upsertCloneDraft(d: CloneDraft): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    await db`
      INSERT INTO clone_drafts
        (telegram_user_id, chat_id, source_url, competitor_account, state, photo_id, pending_file_id, updated_at)
      VALUES
        (${d.telegram_user_id}, ${d.chat_id}, ${d.source_url}, ${d.competitor_account}, ${d.state}, ${d.photo_id}, ${d.pending_file_id}, NOW())
      ON CONFLICT (telegram_user_id) DO UPDATE SET
        chat_id            = EXCLUDED.chat_id,
        source_url         = EXCLUDED.source_url,
        competitor_account = EXCLUDED.competitor_account,
        state              = EXCLUDED.state,
        photo_id           = EXCLUDED.photo_id,
        pending_file_id    = EXCLUDED.pending_file_id,
        updated_at         = NOW()
    `
  } catch (e: any) {
    console.warn("[users-db] upsertCloneDraft failed:", e?.message)
  }
}

export async function getCloneDraft(telegramUserId: number): Promise<CloneDraft | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`
      SELECT telegram_user_id, chat_id, source_url, competitor_account, state, photo_id, pending_file_id
      FROM clone_drafts
      WHERE telegram_user_id = ${telegramUserId}
    `
    return (row as CloneDraft | undefined) ?? null
  } catch (e: any) {
    console.warn("[users-db] getCloneDraft failed:", e?.message)
    return null
  }
}

export async function clearCloneDraft(telegramUserId: number): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    await db`DELETE FROM clone_drafts WHERE telegram_user_id = ${telegramUserId}`
  } catch (e: any) {
    console.warn("[users-db] clearCloneDraft failed:", e?.message)
  }
}
