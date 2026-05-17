import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PLAN_PRICES: Record<string, number> = { pro: 29, builder: 79, architect: 199 }

// Возвращает дневные ряды за последние 30 дней:
//   signups       — новых пользователей в день (по signed_up_at)
//   completions   — завершённых уроков в день (по completed_at)
//   active_users  — пользователей активных в этот день (DAU)
//   mrr           — кумулятивный MRR от подписок, активных на конец дня
export async function GET() {
  try {
    const [{ rows: signups }, { rows: completions }, { rows: activity }, { rows: mrrRows }] =
      await Promise.all([
        db.query<{ d: string; n: string }>(
          `SELECT to_char(d::date, 'YYYY-MM-DD') AS d, COUNT(u.id)::text AS n
           FROM generate_series(NOW() - INTERVAL '29 days', NOW(), INTERVAL '1 day') AS d
           LEFT JOIN platform_users u ON DATE(u.signed_up_at) = d::date
           GROUP BY d ORDER BY d`,
        ),
        db.query<{ d: string; n: string }>(
          `SELECT to_char(d::date, 'YYYY-MM-DD') AS d, COUNT(p.id)::text AS n
           FROM generate_series(NOW() - INTERVAL '29 days', NOW(), INTERVAL '1 day') AS d
           LEFT JOIN lesson_progress p ON DATE(p.completed_at) = d::date AND p.status = 'completed'
           GROUP BY d ORDER BY d`,
        ),
        db.query<{ d: string; n: string }>(
          `SELECT to_char(d::date, 'YYYY-MM-DD') AS d,
                  COUNT(DISTINCT u.id)::text AS n
           FROM generate_series(NOW() - INTERVAL '29 days', NOW(), INTERVAL '1 day') AS d
           LEFT JOIN platform_users u
             ON u.last_active >= d - INTERVAL '7 days' AND u.last_active < d + INTERVAL '1 day'
           GROUP BY d ORDER BY d`,
        ),
        db.query<{ d: string; plan: string; n: string }>(
          `WITH days AS (
             SELECT d::date AS day
             FROM generate_series(NOW() - INTERVAL '29 days', NOW(), INTERVAL '1 day') AS d
           )
           SELECT to_char(days.day, 'YYYY-MM-DD') AS d, s.plan, COUNT(s.id)::text AS n
           FROM days
           LEFT JOIN platform_subscriptions s
             ON s.started_at <= days.day + INTERVAL '1 day'
            AND (s.cancelled_at IS NULL OR s.cancelled_at > days.day)
           WHERE s.plan IS NOT NULL
           GROUP BY days.day, s.plan
           ORDER BY days.day`,
        ),
      ])

    // Сворачиваем MRR по дням
    const mrrByDay: Record<string, number> = {}
    for (const r of mrrRows) {
      mrrByDay[r.d] = (mrrByDay[r.d] ?? 0) + (PLAN_PRICES[r.plan] ?? 0) * Number(r.n)
    }

    const days = signups.map(r => r.d)
    const series = days.map((d, i) => ({
      date: d,
      signups: Number(signups[i].n),
      completions: Number(completions[i]?.n ?? 0),
      activeUsers: Number(activity[i]?.n ?? 0),
      mrr: mrrByDay[d] ?? 0,
    }))

    return NextResponse.json({ series })
  } catch (e: any) {
    return NextResponse.json({ series: [], error: e.message }, { status: 500 })
  }
}
