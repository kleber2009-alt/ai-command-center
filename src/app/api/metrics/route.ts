import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PLAN_PRICES: Record<string, number> = { pro: 29, builder: 79, architect: 199 }
const LESSONS_PER_USER = 26

export async function GET() {
  try {
    const [{ rows: userRows }, { rows: completedRows }, { rows: subRows }] = await Promise.all([
      db.query<{ total: string; active7d: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days')::text AS active7d
         FROM platform_users`
      ),
      db.query<{ completed: string }>(
        `SELECT COUNT(*)::text AS completed
         FROM lesson_progress
         WHERE status = 'completed'`
      ),
      db.query<{ plan: string; count: string }>(
        `SELECT plan, COUNT(*)::text AS count
         FROM platform_subscriptions
         WHERE status = 'active'
         GROUP BY plan`
      ),
    ])

    const totalUsers = Number(userRows[0]?.total ?? 0)
    const activeUsers7d = Number(userRows[0]?.active7d ?? 0)
    const completedLessons = Number(completedRows[0]?.completed ?? 0)

    const paidUsers = subRows.reduce((n, r) => n + Number(r.count), 0)
    const mrr = subRows.reduce(
      (sum, r) => sum + (PLAN_PRICES[r.plan] ?? 0) * Number(r.count),
      0,
    )

    const conversionRate = totalUsers > 0 ? (paidUsers / totalUsers) * 100 : 0
    const completionRate =
      totalUsers > 0 ? (completedLessons / (totalUsers * LESSONS_PER_USER)) * 100 : 0

    const today = new Date()
    const daysLeft =
      new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()

    return NextResponse.json({
      totalUsers,
      activeUsers7d,
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
