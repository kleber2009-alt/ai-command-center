// POST /api/telegram/webhook — Telegram → нам.
// Подписывается через setWebhook + secret token (проверяется header
// X-Telegram-Bot-Api-Secret-Token).

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, tokenWallets, aiJobs, aiTools, payments } from "@/lib/db/schema";
import { sendMessage, webAppButton } from "@/lib/telegram/api";
import { telegramEmail } from "@/lib/telegram/validate";
import { answerPreCheckoutQuery, verifyPayload } from "@/lib/telegram/stars";
import { credit } from "@/lib/wallet";
import { child } from "@/lib/logger";

const log = child("telegram.webhook");
export const dynamic = "force-dynamic";

const WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL ?? "https://aihub-app.46-62-215-11.nip.io/tma";

interface TgSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

interface TgPreCheckoutQuery {
  id: string;
  from: { id: number; username?: string };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name?: string; username?: string };
    chat: { id: number };
    text?: string;
    successful_payment?: TgSuccessfulPayment;
  };
  pre_checkout_query?: TgPreCheckoutQuery;
}

export async function POST(req: Request) {
  // Optional shared-secret check (set via setWebhook param `secret_token`).
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expected) {
      log.warn("invalid webhook secret");
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const update = (await req.json().catch(() => ({}))) as TgUpdate;

  // ============== Telegram Stars ==============
  // pre_checkout_query — Telegram asks "ok to charge?" — must answer within 10s.
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const paymentId = verifyPayload(q.invoice_payload);
    try {
      if (!paymentId) {
        await answerPreCheckoutQuery({ query_id: q.id, ok: false, error_message: "Invalid invoice. Try again." });
        return NextResponse.json({ ok: true });
      }
      const [row] = await db.select({ id: payments.id, status: payments.status, stars: payments.amountCents })
        .from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!row || row.status !== "pending") {
        await answerPreCheckoutQuery({ query_id: q.id, ok: false, error_message: "Payment expired. Please retry." });
        return NextResponse.json({ ok: true });
      }
      if (q.currency !== "XTR" || Number(row.stars) !== q.total_amount) {
        await answerPreCheckoutQuery({ query_id: q.id, ok: false, error_message: "Price mismatch." });
        return NextResponse.json({ ok: true });
      }
      await answerPreCheckoutQuery({ query_id: q.id, ok: true });
    } catch (err) {
      log.error("pre_checkout_query failed", { error: err instanceof Error ? err.message : String(err), payment_id: paymentId });
    }
    return NextResponse.json({ ok: true });
  }

  // successful_payment — credit the wallet and mark payment row succeeded.
  if (update.message?.successful_payment) {
    const sp = update.message.successful_payment;
    const paymentId = verifyPayload(sp.invoice_payload);
    if (!paymentId) {
      log.warn("successful_payment with invalid payload", { charge: sp.telegram_payment_charge_id });
      return NextResponse.json({ ok: true });
    }
    try {
      const [row] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!row) {
        log.warn("successful_payment for unknown payment_id", { paymentId });
        return NextResponse.json({ ok: true });
      }
      if (row.status === "succeeded") {
        // Idempotency: Telegram retries — already credited.
        return NextResponse.json({ ok: true });
      }
      await credit({
        userId: row.userId,
        amount: row.tokensToAdd,
        type: "purchase",
        paymentId: row.id,
        description: `Telegram Stars · ${sp.total_amount}⭐ · ${row.tokensToAdd} tokens`,
      });
      await db.update(payments).set({
        status: "succeeded",
        providerPaymentId: sp.telegram_payment_charge_id,
        completedAt: new Date(),
        metadata: { ...(row.metadata as Record<string, unknown> ?? {}),
          telegram_charge: sp.telegram_payment_charge_id,
          provider_charge: sp.provider_payment_charge_id },
      }).where(eq(payments.id, row.id));

      // DM the buyer.
      try {
        await sendMessage({
          chat_id: update.message.chat.id,
          text: `Оплата прошла ✓\n\n+${row.tokensToAdd.toLocaleString()} токенов на баланс. Спасибо!`,
        });
      } catch { /* user-facing notification is best-effort */ }

      log.info("stars payment credited", { paymentId, tokens: row.tokensToAdd, charge: sp.telegram_payment_charge_id });
    } catch (err) {
      log.error("successful_payment processing failed", { error: err instanceof Error ? err.message : String(err), paymentId });
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (!msg?.text) return NextResponse.json({ ok: true, ignored: true });

  const chatId = msg.chat.id;
  const tgUserId = msg.from.id;
  const text = msg.text.trim();
  const cmd = text.split(/\s+/)[0].toLowerCase();
  const firstName = msg.from.first_name ?? "друг";

  try {
    if (cmd === "/start" || cmd === "/app") {
      await sendMessage({
        chat_id: chatId,
        text:
          `Привет, ${firstName}! 👋\n\n` +
          `Это <b>AI Creative Hub</b> — один кабинет для всех AI-генераций.\n\n` +
          `🍌 <b>Nano Banana 2</b> — Google Gemini 2.5, премиум-редактирование\n` +
          `🎨 16 инструментов: FLUX, BiRefNet, Real-ESRGAN, Kling 1.6/2.1, Clarity Upscaler\n` +
          `🖼 <b>Галерея</b> — вся история генераций сохраняется автоматически\n\n` +
          `💰 <b>100 токенов в подарок</b> при первом входе. Этого хватит на ~8 генераций Nano Banana 2.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [ webAppButton("🎨 Открыть AI Hub", WEBAPP_URL) ],
            [
              webAppButton("🍌 Nano Banana 2", `${WEBAPP_URL}?startapp=nano-banana-2`),
              webAppButton("🖼 Галерея",       `${WEBAPP_URL}?startapp=gallery`),
            ],
          ],
        },
        disable_web_page_preview: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/gallery") {
      await sendMessage({
        chat_id: chatId,
        text:
          `🖼 <b>Галерея</b>\n` +
          `Все сгенерированные картинки и видео сохраняются автоматически в MinIO ` +
          `и доступны навсегда (не зависит от TTL провайдера).`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[ webAppButton("🖼 Открыть галерею", `${WEBAPP_URL}?startapp=gallery`) ]],
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/tools") {
      await sendMessage({
        chat_id: chatId,
        text:
          `🎨 <b>Каталог инструментов</b> · 16 моделей\n\n` +
          `Image: Nano Banana 2, FLUX, FLUX Pro Kontext, BiRefNet, Real-ESRGAN, Clarity Upscaler\n` +
          `Video: Kling 1.6 / Kling 2.1 Master / Video Upscale\n` +
          `Face: Face Swap\n` +
          `+ Carousel · Reels Script (soon)`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[ webAppButton("🎨 Открыть каталог", `${WEBAPP_URL}?startapp=tools`) ]],
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/wallet") {
      await sendMessage({
        chat_id: chatId,
        text: `💰 <b>Кошелёк</b>\nБаланс, история транзакций и пополнение токенов.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[ webAppButton("💰 Открыть кошелёк", `${WEBAPP_URL}?startapp=wallet`) ]],
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/banana") {
      await sendMessage({
        chat_id: chatId,
        text:
          `🍌 <b>Nano Banana 2</b>\n` +
          `Google Gemini 2.5 Flash Image. Премиум-редактирование с сохранением идентичности.\n` +
          `12 токенов за генерацию · до 14 input-изображений · 1K/2K/4K.`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            webAppButton("🍌 Открыть Nano Banana 2", `${WEBAPP_URL}?start=nano-banana-2`),
          ]],
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/balance") {
      const email = telegramEmail(tgUserId);
      const [row] = await db.select({
        available: tokenWallets.available, reserved: tokenWallets.reserved,
        total_spent: tokenWallets.totalSpent,
      })
        .from(tokenWallets)
        .innerJoin(users, eq(users.id, tokenWallets.userId))
        .where(eq(users.email, email))
        .limit(1);

      const reply = row
        ? `💰 <b>Баланс</b>\n\n` +
          `Доступно: <b>${Number(row.available).toLocaleString()}</b> токенов\n` +
          `В работе: ${Number(row.reserved).toLocaleString()}\n` +
          `Потрачено всего: ${Number(row.total_spent).toLocaleString()}`
        : `Ты ещё не открывал AI Hub. Жми кнопку — получишь 100 токенов в подарок.`;

      await sendMessage({
        chat_id: chatId, text: reply, parse_mode: "HTML",
        reply_markup: row ? undefined
          : { inline_keyboard: [[ webAppButton("🚀 Получить 100 токенов", WEBAPP_URL) ]] },
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/history") {
      const email = telegramEmail(tgUserId);
      const jobs = await db.select({
        id: aiJobs.id, status: aiJobs.status, model: aiJobs.model,
        cost: aiJobs.costTokens, created_at: aiJobs.createdAt,
      })
        .from(aiJobs)
        .innerJoin(users, eq(users.id, aiJobs.userId))
        .where(eq(users.email, email))
        .orderBy(desc(aiJobs.createdAt))
        .limit(5);

      const lines = jobs.length
        ? jobs.map((j, i) => {
            const date = j.created_at ? new Date(j.created_at as unknown as string).toLocaleString("ru-RU") : "?";
            return `${i + 1}. <code>${(j.model ?? "—").slice(0, 40)}</code>\n   ${j.status} · ${j.cost} ток · ${date}`;
          }).join("\n\n")
        : "Пока ничего не запускал.";

      await sendMessage({
        chat_id: chatId,
        text: `📜 <b>Последние генерации</b>\n\n${lines}`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/help") {
      await sendMessage({
        chat_id: chatId,
        text:
          `<b>Как это работает</b>\n\n` +
          `1. Жми «🎨 Открыть AI Hub» → запускается Mini App\n` +
          `2. При первом входе автоматически даём 100 токенов\n` +
          `3. Выбирай инструмент, описывай задачу, нажимай Run\n` +
          `4. Результат сохраняется в галерее навсегда\n\n` +
          `<b>Команды:</b>\n` +
          `/app — открыть приложение\n` +
          `/tools — каталог инструментов\n` +
          `/gallery — галерея генераций\n` +
          `/banana — Nano Banana 2\n` +
          `/wallet — кошелёк + покупка токенов\n` +
          `/balance — текущий баланс\n` +
          `/history — последние генерации\n\n` +
          `<b>Цены за генерацию:</b>\n` +
          `· Nano Banana 2: 12 токенов\n` +
          `· FLUX text-to-image: 5 токенов\n` +
          `· Background Remover: 2 токена\n` +
          `· Image Upscale: 3 токена\n` +
          `· Image → Video (Kling 1.6): 80 токенов\n` +
          `· Image → Video Pro (Kling 2.1 Master): 220 токенов`,
        parse_mode: "HTML",
      });
      return NextResponse.json({ ok: true });
    }

    // Default — non-command message
    await sendMessage({
      chat_id: chatId,
      text: `Не понял команду. Жми /app или используй кнопку меню чтобы открыть AI Hub.`,
      reply_markup: { inline_keyboard: [[ webAppButton("🎨 Открыть AI Hub", WEBAPP_URL) ]] },
    });
    return NextResponse.json({ ok: true });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("webhook handler failed", { error: msg, cmd, tgUserId });
    return NextResponse.json({ ok: true, error: msg });           // Always 2xx to Telegram
  }
}
