// POST /api/auth/telegram { initData: "<tgWebAppData>" }
//
// Validates Telegram Mini App initData, creates or finds user by telegram_id-derived
// email, creates Auth.js session, sets cookie. Client redirects to /play/... after.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { validateInitData, telegramEmail, TelegramValidationError } from "@/lib/telegram/validate";
import { child } from "@/lib/logger";

const log = child("auth.telegram");
export const dynamic = "force-dynamic";

const SESSION_DAYS = 30;

export async function POST(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "bot_token_missing" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { initData?: string };
  if (!body.initData) {
    return NextResponse.json({ error: "initData_required" }, { status: 400 });
  }

  let payload;
  try {
    payload = validateInitData(body.initData, botToken);
  } catch (err) {
    const code = err instanceof TelegramValidationError ? err.code : "INVALID";
    log.warn("initData validation failed", { code });
    return NextResponse.json({ error: "invalid_init_data", code }, { status: 401 });
  }

  if (!payload.user) {
    return NextResponse.json({ error: "no_user_in_init_data" }, { status: 400 });
  }

  const tg = payload.user;
  const email = telegramEmail(tg.id);
  const displayName = [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() || tg.username || `tg-${tg.id}`;

  // Upsert user. on_user_created trigger автоматически создаёт wallet + 100 bonus.
  let userId: string;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    userId = existing.id;
  } else {
    userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email,
      name: displayName,
      image: tg.photo_url ?? null,
      emailVerified: new Date(),                   // считаем Telegram-auth as верифицированный
    });
    log.info("new TG user created", { userId, telegramId: tg.id, username: tg.username });
  }

  // Create Auth.js session row directly. Auth.js Drizzle adapter expects
  // `sessions(sessionToken PK, userId, expires)`.
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId, expires });

  // Set session cookie matching Auth.js naming. Production uses __Secure- prefix.
  const isHttps = (req.headers.get("x-forwarded-proto") ?? "").includes("https");
  const cookieName = isHttps ? "__Secure-authjs.session-token" : "authjs.session-token";
  const res = NextResponse.json({
    ok: true,
    user: { id: userId, email, name: displayName, telegram_id: tg.id },
  });
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "none",                              // Telegram WebView is cross-origin
    path: "/",
    expires,
  });

  return res;
}
