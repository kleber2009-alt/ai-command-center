import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  phone?: string;
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("8")) return "+7" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("7")) return "+" + digits;
  if (digits.length === 10) return "+7" + digits;
  return "+" + digits;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const name = (body.name || "").trim().slice(0, 200);
  const phoneRaw = (body.phone || "").trim().slice(0, 50);
  const phone = normalizePhone(phoneRaw);

  if (!name || !phone || phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json(
      { error: "Заполните имя и корректный телефон" },
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
    "<b>Заявка на обратный звонок</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(name)}`,
    `<b>Телефон:</b> <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`,
  ].join("\n");

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
