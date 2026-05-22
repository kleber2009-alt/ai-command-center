// fetch wrapper that injects the Telegram Mini App initData header
// when the page is opened inside Telegram. Outside of Telegram it
// behaves exactly like global fetch.

function telegramInitData(): string {
  if (typeof window === 'undefined') return ''
  const tg = (window as any).Telegram?.WebApp
  return (tg?.initData as string) || ''
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const initData = telegramInitData()
  if (!initData) return fetch(input, init)

  const headers = new Headers(init.headers || {})
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `tma ${initData}`)
  }
  return fetch(input, { ...init, headers })
}
