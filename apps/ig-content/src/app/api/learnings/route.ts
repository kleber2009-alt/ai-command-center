import { NextResponse } from 'next/server'
import { requireUser, jsonError, GENERATION_ERROR } from '@/lib/api'
import { runWeeklyLearning } from '@/lib/learnings'

// GET — list persisted agent learnings (newest first).
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('agent_learnings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ learnings: data ?? [] })
}

// POST — run the weekly learning summary over recent metrics + feedback and
// persist the derived insights to agent_learnings.
export async function POST() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  try {
    const learnings = await runWeeklyLearning(supabase, user.id)
    if (learnings.length === 0) {
      return jsonError('Недостаточно данных для выводов. Добавьте метрики и оценки.', 400)
    }
    return NextResponse.json({ learnings, count: learnings.length })
  } catch (err) {
    console.error('weekly learning failed:', err)
    return jsonError(GENERATION_ERROR, 502)
  }
}
