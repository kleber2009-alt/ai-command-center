import { getDb } from './db'

export type UserTier = 'free' | 'pro' | 'team'

export type AppUser = {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  subscription_tier: UserTier
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
    return row as QuotaInfo
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
