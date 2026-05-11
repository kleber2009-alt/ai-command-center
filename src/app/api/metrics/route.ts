import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    const [usersRes, progressRes, subsRes] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('progress').select('*').eq('status', 'completed'),
      supabase.from('subscriptions').select('*').eq('status', 'active'),
    ])

    const users = usersRes.data || []
    const progress = progressRes.data || []
    const subs = subsRes.data || []

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const activeUsers = users.filter((u: any) => u.last_active > sevenDaysAgo)
    const paidUsers = subs.length

    const planPrices: Record<string, number> = { pro: 29, builder: 79, architect: 199 }
    const mrr = subs.reduce((sum: number, s: any) => sum + (planPrices[s.plan] || 0), 0)

    const conversionRate = users.length > 0 ? (paidUsers / users.length * 100) : 0
    const completionRate = users.length > 0 ? (progress.length / (users.length * 26) * 100) : 0

    const today = new Date()
    const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()

    return NextResponse.json({
      totalUsers: users.length,
      activeUsers7d: activeUsers.length,
      paidUsers,
      mrr,
      conversionRate: conversionRate.toFixed(1),
      completionRate: completionRate.toFixed(1),
      daysLeft,
      achieved: 7200000,
      monthGoal: 10000000,
      dailyNeeded: 140000,
      goalPercent: 72,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
