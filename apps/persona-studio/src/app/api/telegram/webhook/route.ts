// Telegram bot webhook — handles pre_checkout_query and successful_payment
// for Telegram Stars billing.
//
// Webhook setup (one-time):
//   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
//     -d "url=https://persona-app.46-62-215-11.nip.io/api/telegram/webhook" \
//     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
//     -d "allowed_updates=[\"pre_checkout_query\",\"message\"]"
//
// We verify the secret in the `x-telegram-bot-api-secret-token` header.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { creditTokens } from '@/lib/tokens';

export const runtime = 'nodejs';

const BOT_API = 'https://api.telegram.org';

async function answerPreCheckout(queryId: string, ok: boolean, error?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${BOT_API}/bot${token}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pre_checkout_query_id: queryId,
      ok,
      ...(ok ? {} : { error_message: error ?? 'Sorry, payment cannot be processed.' }),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

type Update = {
  update_id: number;
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id?: string;
    };
  };
};

const TMA_URL = 'https://persona-app.46-62-215-11.nip.io/tma';

async function sendMessage(chatId: number, text: string, opts?: { withTmaButton?: boolean }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (opts?.withTmaButton) {
    body.reply_markup = {
      inline_keyboard: [[{ text: '🎨 Открыть Persona Studio', web_app: { url: TMA_URL } }]],
    };
  }
  await fetch(`${BOT_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

export async function POST(req: NextRequest) {
  // Verify webhook secret (set in setWebhook via secret_token).
  // This endpoint credits tokens on successful_payment, so an unverified
  // request is a money-minting vector. Fail CLOSED in production: if the
  // secret is not configured, reject everything rather than trust the caller.
  // In dev we allow an unset secret for local testing.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers.get('x-telegram-bot-api-secret-token');
    if (got !== expectedSecret) {
      return NextResponse.json({ error: 'bad_secret' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Stars payments silently die here if the secret is missing: Telegram
    // retries, the buyer never gets tokens. Make sure this is loud in logs.
    console.error(
      '[telegram/webhook] TELEGRAM_WEBHOOK_SECRET is not configured — rejecting update, Stars payments are broken until it is set',
    );
    return NextResponse.json(
      { error: 'webhook_secret_not_configured' },
      { status: 503 },
    );
  }

  let update: Update;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // pre_checkout_query — must answer within 10 seconds with ok=true to
  // allow Telegram to complete the payment.
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const row = await prisma.cryptoInvoice.findUnique({ where: { id: q.invoice_payload } });
    if (!row || row.status !== 'active') {
      await answerPreCheckout(q.id, false, 'Invoice not found or already paid');
      return NextResponse.json({ ok: true });
    }
    if (q.currency !== 'XTR' || q.total_amount !== Number(row.amount)) {
      await answerPreCheckout(q.id, false, 'Amount mismatch');
      return NextResponse.json({ ok: true });
    }
    await answerPreCheckout(q.id, true);
    return NextResponse.json({ ok: true });
  }

  // /start (and /app, /help) — welcome message with TMA button.
  if (update.message?.text && !update.message.successful_payment) {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    const name = update.message.from?.first_name ?? 'друг';
    if (text === '/start' || text.startsWith('/start ')) {
      await sendMessage(
        chatId,
        `Привет, ${name}!\n\n` +
        `<b>Persona Studio</b> — AI Identity Operating System.\n` +
        `1 фото → 10 AI-аватаров → говорящие видео, обложки, клон голоса.\n\n` +
        `Тебе уже зачислено <b>10 токенов</b> в подарок — этого хватит на первый батч из 10 аватаров.\n\n` +
        `Открой Mini App кнопкой ниже 👇`,
        { withTmaButton: true },
      );
    } else if (text === '/app') {
      await sendMessage(chatId, 'Запускаю Mini App 👇', { withTmaButton: true });
    } else if (text === '/help') {
      await sendMessage(
        chatId,
        `<b>Команды:</b>\n` +
        `/start — приветствие + Mini App\n` +
        `/app — открыть Mini App\n` +
        `/help — эта подсказка\n\n` +
        `Поддержка: @ilia_pali0`,
        { withTmaButton: true },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // successful_payment — credit tokens. Idempotent via active→paid flip.
  if (update.message?.successful_payment) {
    const sp = update.message.successful_payment;
    const row = await prisma.cryptoInvoice.findUnique({ where: { id: sp.invoice_payload } });
    if (!row) {
      return NextResponse.json({ ok: true, note: 'unknown_payload' });
    }
    const flipped = await prisma.cryptoInvoice.updateMany({
      where: { id: row.id, status: 'active' },
      data: {
        status: 'paid',
        paidAt: new Date(),
        // Keep TG charge id in invoiceId for traceability (was a placeholder before)
        invoiceId: `stars:${sp.telegram_payment_charge_id}`,
      },
    });
    if (flipped.count === 0) {
      return NextResponse.json({ ok: true, note: 'already_paid_race' });
    }
    await creditTokens({
      userId: row.userId,
      amount: row.tokens,
      type: 'purchase',
      reason: `stars:${row.pack}:${sp.telegram_payment_charge_id}`,
      refId: row.id,
    });
    return NextResponse.json({ ok: true, credited: row.tokens });
  }

  return NextResponse.json({ ok: true });
}
