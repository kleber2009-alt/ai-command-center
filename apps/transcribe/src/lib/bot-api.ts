// Minimal Telegram Bot API client for server-side calls (webhook handler,
// invoice link generation). Client-side TMA helpers live in `telegram.ts`.

const API_BASE = 'https://api.telegram.org'

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN not set')
  return t
}

type ApiResult<T = unknown> = { ok: boolean; result?: T; description?: string }

async function call<T = unknown>(method: string, body?: object): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/bot${token()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e: any) {
    console.warn(`[bot-api] ${method} network error:`, e?.message)
    return { ok: false, description: e?.message }
  }
  const json = (await res.json().catch(() => ({}))) as ApiResult<T>
  if (!json.ok) console.warn(`[bot-api] ${method} failed:`, json.description)
  return json
}

export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; web_app: { url: string } }
  | { text: string; callback_data: string }

export type ReplyMarkup = { inline_keyboard: InlineKeyboardButton[][] }

export function sendMessage(
  chatId: number,
  text: string,
  opts?: { reply_markup?: ReplyMarkup; parse_mode?: 'HTML' | 'MarkdownV2'; disable_web_page_preview?: boolean },
) {
  return call('sendMessage', { chat_id: chatId, text, ...opts })
}

// Edits the text of a previously-sent message. Used by the feature menu
// so a single message swaps between menu/detail views instead of
// spamming the chat with new messages on every button press.
export function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  opts?: { reply_markup?: ReplyMarkup; parse_mode?: 'HTML' | 'MarkdownV2'; disable_web_page_preview?: boolean },
) {
  return call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...opts })
}

// Acknowledges a callback_query so Telegram stops showing the spinner.
// Optional `text` appears as a toast above the chat.
export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
}

export function answerPreCheckoutQuery(id: string, ok: boolean, error_message?: string) {
  return call('answerPreCheckoutQuery', { pre_checkout_query_id: id, ok, error_message })
}

export async function createInvoiceLink(args: {
  title: string
  description: string
  payload: string
  currency: string
  prices: { label: string; amount: number }[]
  provider_token?: string
}): Promise<string | null> {
  const res = await call<string>('createInvoiceLink', {
    title: args.title,
    description: args.description,
    payload: args.payload,
    currency: args.currency,
    prices: args.prices,
    provider_token: args.provider_token ?? '',
  })
  return res.result ?? null
}
