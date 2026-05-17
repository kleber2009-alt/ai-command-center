import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PLAN_PRICES: Record<string, number> = { pro: 29, builder: 79, architect: 199 }
const LESSONS_PER_USER = 26

export async function GET() {
  try {
    const [
      { rows: userRows },
      { rows: completedRows },
      { rows: subRows },
      { rows: goalRows },
      { rows: revenueRows },
    ] = await Promise.all([
      db.query<{ total: string; active7d: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days')::text AS active7d
         FROM platform_users`,
      ),
      db.query<{ completed: string }>(
        `SELECT COUNT(*)::text AS completed
         FROM lesson_progress WHERE status = 'completed'`,
      ),
      db.query<{ plan: string; count: string }>(
        `SELECT plan, COUNT(*)::text AS count
         FROM platform_subscriptions WHERE status = 'active' GROUP BY plan`,
      ),
      // Цель текущего месяца (в рублях по дефолту)
      db.query<{ target: string; currency_rate: string; currency: string }>(
        `SELECT target::text, currency_rate::text, currency
         FROM revenue_goals
         WHERE month = date_trunc('month', NOW())::date
         ORDER BY currency
         LIMIT 1`,
      ),
      // Достигнутая выручка за месяц = сумма plan-цен подписок, начатых в этом месяце.
      // Это грубо: реально нужен ledger платежей, но пока считаем по новым активациям.
      db.query<{ usd: string }>(
        `SELECT COALESCE(SUM(
           CASE plan
             WHEN 'pro'       THEN 29
             WHEN 'builder'   THEN 79
             WHEN 'architect' THEN 199
             ELSE 0
           END
         ), 0)::text AS usd
         FROM platform_subscriptions
         WHERE status = 'active'
           AND started_at >= date_trunc('month', NOW())`,
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
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const daysLeft = lastDay - today.getDate()

    // Цели: считаем динамически если есть запись в revenue_goals,
    // иначе возвращаем нули (фронт сам покажет --).
    const goal = goalRows[0]
    const monthGoal = goal ? Number(goal.target) : 0
    const rate = goal ? Number(goal.currency_rate) : 1
    const achievedUsd = Number(revenueRows[0]?.usd ?? 0)
    const achieved = Math.round(achievedUsd * rate)
    const remaining = Math.max(0, monthGoal - achieved)
    const dailyNeeded = daysLeft > 0 ? Math.round(remaining / daysLeft) : remaining
    const goalPercent = monthGoal > 0 ? Math.round((achieved / monthGoal) * 100) : 0

    return NextResponse.json({
      totalUsers,
      activeUsers7d,
      paidUsers,
      mrr,
      conversionRate: conversionRate.toFixed(1),
      completionRate: completionRate.toFixed(1),
      daysLeft,
      achieved,
      monthGoal,
      dailyNeeded,
      goalPercent,
      currency: goal?.currency ?? 'RUB',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
