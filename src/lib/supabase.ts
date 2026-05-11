import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export async function getMetrics() {
  const [usersRes, progressRes, subsRes] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('progress').select('*').eq('status', 'completed'),
    supabase.from('subscriptions').select('*').eq('status', 'active'),
  ])

  const users = usersRes.data || []
  const progress = progressRes.data || []
  const subs = subsRes.data || []

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const activeUsers = users.filter(u => u.last_active > sevenDaysAgo)
  const paidUsers = subs.length

  const planPrices: Record<string, number> = { pro: 29, builder: 79, architect: 199 }
  const mrr = subs.reduce((sum: number, s: any) => sum + (planPrices[s.plan] || 0), 0)

  const conversionRate = users.length > 0 ? (paidUsers / users.length * 100) : 0
  const completionRate = users.length > 0 ? (progress.length / (users.length * 26) * 100) : 0

  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - today.getDate()

  const monthGoal = 10000000 // ₽10M
  const achieved = mrr * 250 * 0.72 // demo
  const dailyNeeded = (monthGoal - achieved) / Math.max(daysLeft, 1)

  return {
    totalUsers: users.length,
    activeUsers7d: activeUsers.length,
    paidUsers,
    mrr,
    conversionRate: conversionRate.toFixed(1),
    completionRate: completionRate.toFixed(1),
    daysLeft,
    achieved,
    monthGoal,
    dailyNeeded,
    goalPercent: Math.round(achieved / monthGoal * 100),
  }
}
