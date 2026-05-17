import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PLAN_PRICES: Record<string, number> = { pro: 29, builder: 79, architect: 199 }
const LESSONS_PER_USER = 26
const TARGET_CONVERSION = 4   // %
const TARGET_COMPLETION = 50  // %

export async function GET() {
  try {
    const [
      { rows: userRows },
      { rows: completedRows },
      { rows: subRows },
      { rows: actionRows },
      { rows: signupTrend },
    ] = await Promise.all([
      db.query<{ total: string; active7d: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days')::text AS active7d
         FROM platform_users`,
      ),
      db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM lesson_progress WHERE status = 'completed'`,
      ),
      db.query<{ plan: string; count: string }>(
        `SELECT plan, COUNT(*)::text AS count
         FROM platform_subscriptions WHERE status = 'active' GROUP BY plan`,
      ),
      db.query(
        `SELECT id, agent_id, agent_name, agent_emoji, text, impact, created_at
         FROM agent_tasks
         WHERE status = 'pending'
         ORDER BY created_at DESC
         LIMIT 6`,
      ),
      db.query<{ recent: string; prev: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE signed_up_at > NOW() - INTERVAL '7 days')::text  AS recent,
           COUNT(*) FILTER (WHERE signed_up_at > NOW() - INTERVAL '14 days'
                          AND signed_up_at <= NOW() - INTERVAL '7 days')::text     AS prev
         FROM platform_users`,
      ),
    ])

    const totalUsers = Number(userRows[0]?.total ?? 0)
    const active7d = Number(userRows[0]?.active7d ?? 0)
    const completed = Number(completedRows[0]?.n ?? 0)
    const paidUsers = subRows.reduce((n, r) => n + Number(r.count), 0)
    const mrr = subRows.reduce((s, r) => s + (PLAN_PRICES[r.plan] ?? 0) * Number(r.count), 0)
    const conversionRate = totalUsers ? (paidUsers / totalUsers) * 100 : 0
    const completionRate = totalUsers ? (completed / (totalUsers * LESSONS_PER_USER)) * 100 : 0

    const risks: string[] = []
    if (conversionRate < TARGET_CONVERSION) {
      risks.push(`Конверсия free→paid: ${conversionRate.toFixed(1)}% (цель: ${TARGET_CONVERSION}%)`)
    }
    if (completionRate < TARGET_COMPLETION) {
      risks.push(`Lesson completion: ${completionRate.toFixed(1)}% (цель: ${TARGET_COMPLETION}%)`)
    }

    // Простой growth-сигнал: signups последних 7 дней vs предыдущих 7
    const recent = Number(signupTrend[0]?.recent ?? 0)
    const prev = Number(signupTrend[0]?.prev ?? 0)
    const growthPct = prev > 0 ? Math.round(((recent - prev) / prev) * 100) : null
    const growthLine =
      growthPct === null
        ? `Регистрации за неделю: ${recent} (нет данных за пред. период)`
        : `Регистрации за неделю: ${recent} (${growthPct >= 0 ? '+' : ''}${growthPct}% к прошлой)`

    // Простой forecast: текущий MRR * (1 + growth/100) с потолком
    const growthFactor = growthPct === null ? 1 : 1 + Math.min(Math.max(growthPct, -50), 100) / 100
    const mrrForecast = Math.round(mrr * growthFactor)

    const summary =
      risks.length === 0
        ? `Все ключевые метрики в зелёной зоне. MRR=$${mrr}, активных за неделю — ${active7d} из ${totalUsers}. Команде имеет смысл наращивать ставки.`
        : `MRR=$${mrr}, активных за неделю — ${active7d} из ${totalUsers}. ${risks.length === 1 ? 'Одна метрика' : `${risks.length} метрики`} ниже цели — фокус AI-команды на ней.`

    const forecast =
      growthPct === null
        ? `Базовый прогноз: MRR останется около $${mrr}/мес. Нужно больше данных для тренда.`
        : `При текущей динамике (${growthPct >= 0 ? '+' : ''}${growthPct}% к регистрациям) MRR к концу месяца ~$${mrrForecast}.`

    return NextResponse.json({
      date: new Date().toISOString(),
      summary,
      risks,
      growth: growthLine,
      forecast,
      actions: actionRows,
      metrics: {
        totalUsers,
        activeUsers7d: active7d,
        paidUsers,
        mrr,
        conversionRate: conversionRate.toFixed(1),
        completionRate: completionRate.toFixed(1),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
