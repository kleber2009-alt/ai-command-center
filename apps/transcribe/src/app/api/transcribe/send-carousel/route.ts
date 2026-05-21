// Re-delivers a previously generated carousel-image artifact into the
// user's Telegram chat. Used by the "Отправить ещё раз" button in the
// Mini App UI — the auto-send on initial generation lives inside the
// /api/transcribe/generate handler.

import { NextRequest, NextResponse } from 'next/server'

import { guardRequest } from '@/lib/api-guard'
import { sendCarouselMediaGroup } from '@/lib/telegram-bot'
import { dbGetTranscript } from '@/lib/transcripts-db'

export const maxDuration = 60

type Body = { id?: string }

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'send-carousel', max: 10, windowMs: 60_000 },
    requireInitData: true,
  })
  if (!guard.ok) return guard.response

  const chatId = guard.telegram?.user?.id
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!chatId || !botToken) {
    return NextResponse.json({ error: 'telegram_unavailable' }, { status: 503 })
  }

  const { id } = (await req.json().catch(() => ({}))) as Body
  if (!id) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 })
  }

  const row = await dbGetTranscript(id)
  if (!row) {
    return NextResponse.json({ error: 'transcript_not_found' }, { status: 404 })
  }

  const slides = row.generations?.['carousel-image']?.slides
  if (!slides || slides.length === 0) {
    return NextResponse.json({ error: 'carousel_not_generated' }, { status: 404 })
  }

  const result = await sendCarouselMediaGroup(chatId, slides, botToken)
  const status = result.sent > 0 ? 200 : 502
  return NextResponse.json(result, { status })
}
