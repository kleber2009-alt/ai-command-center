import { getServerSupabase } from './transcripts-db'

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
  const db = getServerSupabase()
  if (!db) return null

  const { data, error } = await db
    .from('users')
    .upsert(
      {
        telegram_id: tg.id,
        username: tg.username ?? null,
        first_name: tg.first_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id' },
    )
    .select()
    .single()

  if (error) {
    console.warn('[users-db] getOrCreateUser failed:', error.message)
    return null
  }
  return data as AppUser
}

export async function getQuota(userId: string, tier: UserTier): Promise<QuotaInfo | null> {
  const db = getServerSupabase()
  if (!db) return null

  const { data, error } = await db.rpc('ensure_quota', { p_user_id: userId, p_tier: tier })
  if (error) {
    console.warn('[users-db] getQuota failed:', error.message)
    return null
  }
  const row = data as { minutes_used: number; minutes_limit: number; resets_at: string }
  return row
}

export async function deductMinutes(userId: string, minutes: number): Promise<void> {
  const db = getServerSupabase()
  if (!db) return

  const { error } = await db.rpc('add_minutes_used', { p_user_id: userId, p_minutes: minutes })
  if (error) {
    console.warn('[users-db] deductMinutes failed:', error.message)
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
  const db = getServerSupabase()
  if (!db) return

  const { error } = await db
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    console.warn('[users-db] updateUserStripe failed:', error.message)
  }
}

export async function getUserByStripeCustomer(customerId: string): Promise<AppUser | null> {
  const db = getServerSupabase()
  if (!db) return null

  const { data, error } = await db
    .from('users')
    .select()
    .eq('stripe_customer_id', customerId)
    .single()

  if (error) return null
  return data as AppUser
}
