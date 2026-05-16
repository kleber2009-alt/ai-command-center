import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  name?: string;
  contact?: string;
  message?: string;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const name = (body.name || "").trim().slice(0, 200);
  const contact = (body.contact || "").trim().slice(0, 200);
  const message = (body.message || "").trim().slice(0, 2000);

  if (!name || !contact) {
    return NextResponse.json(
      { error: "Имя и контакт обязательны" },
      { status: 400 },
    );
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("[lead] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы");
    return NextResponse.json(
      { error: "Сервис заявок временно недоступен" },
      { status: 503 },
    );
  }

  const text = [
    "<b>Новая заявка с сайта</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(name)}`,
    `<b>Контакт:</b> ${escapeHtml(contact)}`,
    message ? `<b>Ситуация:</b>\n${escapeHtml(message)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!tgRes.ok) {
    const detail = await tgRes.text().catch(() => "");
    console.error("[lead] Telegram API error", tgRes.status, detail);
    return NextResponse.json(
      { error: "Не удалось отправить заявку" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
