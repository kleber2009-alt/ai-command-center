// Thin wrapper around fetch that auto-attaches Telegram WebApp initData
// when the page is loaded inside a Telegram Mini App. The server-side
// middleware uses it to authenticate calls to /api/transcribe/*.
//
// Outside Telegram the wrapper is a no-op — the call still goes
// through, and the server will fall back to Basic Auth (or accept it
// in dev mode when TELEGRAM_BOT_TOKEN is unset).

import { getTelegram } from './telegram'

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const tg = getTelegram()
  const initData = tg?.initData
  if (!initData) return fetch(input, init)

  const headers = new Headers(init.headers || {})
  headers.set('X-Telegram-Init-Data', initData)
  return fetch(input, { ...init, headers })
}
