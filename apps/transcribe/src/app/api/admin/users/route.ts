// Owner-only admin endpoints for managing transcribe quotas.
// GET — list all users with their quotas.
// POST { telegram_id, delta_minutes, tier? } — grant minutes to a user
//   by telegram_id, creating the user if missing.
// PATCH { user_id, delta_minutes } — bump an existing user's quota.
//
// Guarded with ownerOnly: true, so only the configured OWNER_TELEGRAM_ID
// passes the gate. Without a valid initData / matching owner, the request
// is rejected with 403.
//
// Every successful change attempts to notify the affected user in their
// Telegram chat with the bot. Notification failures don't fail the
// request — the DB write has already happened.

import { NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db'
import { guardRequest } from '@/lib/api-guard'
import {
  adminAddMinutes,
  adminGrantMinutesByTelegramId,
  adminListUsers,
  type UserTier,
} from '@/lib/users-db'

async function notifyUser(telegramId: number, delta: number, newLimit: number): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return false
  const sign = delta >= 0 ? '+' : ''
  const text =
    delta >= 0
      ? `✨ Тебе начислено <b>${sign}${delta} мин</b> транскрибации.\n\nТекущий лимит: <b>${newLimit} мин</b>.`
      : `ℹ️ С твоего лимита списано <b>${Math.abs(delta)} мин</b>.\n\nТекущий лимит: <b>${newLimit} мин</b>.`
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: 'HTML' }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function telegramIdForUser(userId: string): Promise<number | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`SELECT telegram_id FROM users WHERE id = ${userId}::uuid`
    return row?.telegram_id ? Number(row.telegram_id) : null
  } catch {
    return null
  }
}

const RATE = { key: 'admin-users', max: 30, windowMs: 60_000 }

export async function GET(req: NextRequest) {
  const guard = guardRequest(req, { rateLimit: RATE, ownerOnly: true, requireInitData: false })
  if (!guard.ok) return guard.response
  const users = await adminListUsers()
  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, { rateLimit: RATE, ownerOnly: true, requireInitData: false })
  if (!guard.ok) return guard.response

  const body = (await req.json().catch(() => ({}))) as {
    telegram_id?: number
    delta_minutes?: number
    tier?: UserTier
  }
  const tgId = Number(body.telegram_id)
  const delta = Number(body.delta_minutes)
  if (!Number.isFinite(tgId) || tgId <= 0) {
    return NextResponse.json({ error: 'telegram_id_required' }, { status: 400 })
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: 'delta_minutes_required' }, { status: 400 })
  }

  const result = await adminGrantMinutesByTelegramId(tgId, delta, body.tier ?? 'pro')
  if (!result) {
    return NextResponse.json({ error: 'grant_failed' }, { status: 500 })
  }
  const notified = await notifyUser(tgId, delta, result.minutesLimit)
  return NextResponse.json({ ok: true, notified, ...result })
}

export async function PATCH(req: NextRequest) {
  const guard = guardRequest(req, { rateLimit: RATE, ownerOnly: true, requireInitData: false })
  if (!guard.ok) return guard.response

  const body = (await req.json().catch(() => ({}))) as {
    user_id?: string
    delta_minutes?: number
  }
  if (!body.user_id) {
    return NextResponse.json({ error: 'user_id_required' }, { status: 400 })
  }
  const delta = Number(body.delta_minutes)
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: 'delta_minutes_required' }, { status: 400 })
  }

  const newLimit = await adminAddMinutes(body.user_id, delta)
  if (newLimit === null) {
    return NextResponse.json({ error: 'user_not_found_or_no_quota' }, { status: 404 })
  }
  const tgId = await telegramIdForUser(body.user_id)
  const notified = tgId ? await notifyUser(tgId, delta, newLimit) : false
  return NextResponse.json({ ok: true, minutes_limit: newLimit, notified })
}
