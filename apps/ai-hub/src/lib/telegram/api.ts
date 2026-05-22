// Thin wrapper над Telegram Bot HTTP API. Server-only.

const BASE = "https://api.telegram.org";

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !(data as { ok?: boolean }).ok) {
    throw new Error(`Telegram ${method} failed: ${(data as { description?: string }).description ?? res.status}`);
  }
  return (data as { result: T }).result;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
}

export async function sendMessage(args: {
  chat_id: number;
  text: string;
  parse_mode?: "MarkdownV2" | "HTML";
  reply_markup?: { inline_keyboard: InlineKeyboardButton[][] };
  disable_web_page_preview?: boolean;
}) {
  return call("sendMessage", args);
}

export function webAppButton(text: string, url: string): InlineKeyboardButton {
  return { text, web_app: { url } };
}
