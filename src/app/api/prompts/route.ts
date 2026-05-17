import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AI_AGENTS } from '@/lib/agents'
import { AGENT_PROMPTS } from '@/lib/prompts'

// GET /api/prompts → текущий промпт для каждого агента + флаг 'overridden'
export async function GET() {
  try {
    const { rows } = await db.query<{ agent_id: string; prompt: string; updated_at: string }>(
      `SELECT agent_id, prompt, updated_at FROM agent_prompt_overrides`,
    )
    const overrides = new Map(rows.map(r => [r.agent_id, r]))

    const prompts = AI_AGENTS.map(a => {
      const o = overrides.get(a.id)
      return {
        agent_id: a.id,
        agent_name: a.name,
        agent_emoji: a.emoji,
        prompt: o?.prompt ?? AGENT_PROMPTS[a.id] ?? '',
        default_prompt: AGENT_PROMPTS[a.id] ?? '',
        overridden: !!o,
        updated_at: o?.updated_at ?? null,
      }
    })
    return NextResponse.json({ prompts })
  } catch (e: any) {
    return NextResponse.json({ prompts: [], error: e.message }, { status: 500 })
  }
}

// PUT /api/prompts → { agent_id, prompt } upsert override
//                   { agent_id, prompt: null } удаляет override (возврат к дефолту)
export async function PUT(req: NextRequest) {
  const { agent_id, prompt } = await req.json()
  if (!agent_id || !AI_AGENTS.find(a => a.id === agent_id)) {
    return NextResponse.json({ error: 'unknown agent_id' }, { status: 400 })
  }

  try {
    if (prompt === null || prompt === '') {
      await db.query(`DELETE FROM agent_prompt_overrides WHERE agent_id = $1`, [agent_id])
      return NextResponse.json({ agent_id, reverted: true })
    }
    await db.query(
      `INSERT INTO agent_prompt_overrides (agent_id, prompt, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (agent_id) DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = NOW()`,
      [agent_id, prompt],
    )
    return NextResponse.json({ agent_id, saved: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
