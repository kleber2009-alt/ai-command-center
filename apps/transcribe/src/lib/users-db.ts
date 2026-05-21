import { getDb } from './db'

export type UserTier = 'free' | 'pro' | 'team'

export type AppUser = {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  subscription_tier: UserTier
  subscription_expires_at?: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export type QuotaInfo = {
  minutes_used: number
  minutes_limit: number  // -1 means unlimited
  resets_at: string
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
    return row as AppUser
  } catch (e: any) {
    console.warn('[users-db] getOrCreateUser failed:', e?.message)
    return null
  }
}

export async function getQuota(userId: string, tier: UserTier): Promise<QuotaInfo | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`SELECT * FROM ensure_quota(${userId}::uuid, ${tier}::text)`
    if (!row) return null
    // numeric(10,2) comes back as a string from postgres.js — coerce to Number
    // so callers can do real numeric comparisons (used >= limit).
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
    console.warn('[users-db] adminListUsers failed:', e?.message)
    return []
  }
}

// Adds `delta` minutes to the user's quota limit. Delta can be negative.
// Returns the new limit, or null if the user has no quota row yet.
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
    console.warn('[users-db] adminAddMinutes failed:', e?.message)
    return null
  }
}

// Creates a user by telegram_id if missing, ensures a quota row exists,
// and adds `delta` minutes to the limit. Returns the resulting limit.
export async function adminGrantMinutesByTelegramId(
  telegramId: number,
  delta: number,
  tier: UserTier = 'pro',
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
    // ensure_quota uses the tier defaults; we still bump the limit afterwards.
    await db`SELECT ensure_quota(${userId}::uuid, ${tier}::text)`
    const [q] = await db`
      UPDATE user_quotas
      SET minutes_limit = minutes_limit + ${delta}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
      RETURNING minutes_limit
    `
    return { userId, minutesLimit: q ? Number(q.minutes_limit) : 0 }
  } catch (e: any) {
    console.warn('[users-db] adminGrantMinutesByTelegramId failed:', e?.message)
    return null
  }
}
