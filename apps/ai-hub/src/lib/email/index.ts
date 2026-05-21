// Magic-link sender. Уmолчанию через SMTP_URL — Resend / Postmark / SES / local relay.
//
// **First-user / demo mode**: если SMTP_URL не задан ИЛИ содержит "stub"/"demo",
// magic-link просто логируется в stdout (JSON). Это позволяет запустить
// продукт до настройки внешнего SMTP — owner вытаскивает ссылку из логов
// первый раз, после чего сессия валидна 30 дней.

import nodemailer from "nodemailer";
import { child } from "@/lib/logger";

const log = child("email");

function isStub(url: string | undefined): boolean {
  if (!url) return true;
  return /(build-stub|localhost:1025|demo|stub)/i.test(url);
}

let _transporter: nodemailer.Transporter | null = null;
function transporter() {
  if (_transporter) return _transporter;
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("SMTP_URL is not set");
  _transporter = nodemailer.createTransport(url);
  return _transporter;
}

export async function sendVerificationEmail(args: { to: string; url: string }) {
  const smtpUrl = process.env.SMTP_URL;

  // ===== Stub / first-user mode =====
  // Log the magic link with a recognizable prefix so it's grep-able in
  // `docker compose logs ai-hub-web | grep MAGIC_LINK`.
  if (isStub(smtpUrl)) {
    log.warn("MAGIC_LINK · stub-mode (SMTP not configured)", {
      to: args.to,
      url: args.url,
      hint: "Откройте ссылку в браузере чтобы войти. Настройте SMTP_URL для отправки реальных писем.",
    });
    return;
  }

  // ===== Real SMTP =====
  const from = process.env.SMTP_FROM ?? "AI Creative Hub <no-reply@localhost>";
  const host = new URL(args.url).host;

  await transporter().sendMail({
    to: args.to,
    from,
    subject: `Войти в AI Creative Hub`,
    text: `Откройте ссылку, чтобы войти в AI Creative Hub:\n\n${args.url}\n\nЕсли вы не запрашивали вход — игнорируйте это письмо.`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h1 style="font-size:20px;margin:0 0 16px">AI Creative Hub</h1>
        <p style="color:#555;margin:0 0 24px">Нажмите кнопку, чтобы войти.</p>
        <a href="${args.url}"
           style="display:inline-block;background:#7c5cff;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:500">
          Войти в кабинет
        </a>
        <p style="color:#888;margin:24px 0 0;font-size:12px">
          Ссылка одноразовая, действует 24 часа. Открыта на <b>${host}</b>.
        </p>
      </div>
    `,
  });
  log.info("magic link sent", { to: args.to, host });
}
