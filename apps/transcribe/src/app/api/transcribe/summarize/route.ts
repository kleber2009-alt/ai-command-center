import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { dbGetTranscript, dbSaveSummary } from '@/lib/transcripts-db'

export const maxDuration = 60

type Body = { id?: string; transcript?: string }

const PROMPT = (text: string) => `Прочитай транскрипт видео или аудиозаписи и сделай:
1. summary — краткий пересказ в 2-3 предложениях на русском
2. bullets — 5 ключевых тезисов/идей на русском (каждый одной строкой)

Транскрипт:
"""
${text.slice(0, 30000)}
"""

Отвечай ТОЛЬКО валидным JSON, без markdown-обёртки:
{"summary": "...", "bullets": ["...", "...", "...", "...", "..."]}`

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'summarize', max: 20, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const { id, transcript } = (await req.json()) as Body

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  let text = transcript
  if (id) {
    const row = await dbGetTranscript(id)
    if (!row) {
      return NextResponse.json({ error: 'Транскрипт не найден' }, { status: 404 })
    }
    if (row.summary && row.bullets) {
      return NextResponse.json({ summary: row.summary, bullets: row.bullets, cached: true })
    }
    text = row.transcript
  }

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'Пустой транскрипт' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: PROMPT(text) }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Anthropic (${res.status}): ${errText.slice(0, 300)}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    const raw = data.content?.[0]?.text || '{}'
    const cleaned = raw.replace(/```json?|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as { summary: string; bullets: string[] }

    if (id) {
      await dbSaveSummary(id, parsed.summary, parsed.bullets)
    }

    return NextResponse.json({ summary: parsed.summary, bullets: parsed.bullets, cached: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка генерации саммари' }, { status: 500 })
  }
}
