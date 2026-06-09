import nodemailer, { Transporter } from 'nodemailer';
import { log } from './logger';

/**
 * SMTP mail helper. Configured via SMTP_URL (e.g.
 * smtps://user:pass@smtp.example.com:465) and MAIL_FROM. Used for transactional
 * email such as password-reset codes.
 */
let _tx: Transporter | null = null;

function transport(): Transporter {
  if (_tx) return _tx;
  const url = process.env.SMTP_URL;
  if (!url) throw new Error('SMTP_URL is not configured');
  _tx = nodemailer.createTransport(url);
  return _tx;
}

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const from = process.env.MAIL_FROM || 'Club Der Denker <no-reply@clubderdenker.app>';
  try {
    await transport().sendMail({ from, to, subject, text, html });
  } catch (e: any) {
    log.error('mail send failed', { to, subject, err: e.message });
    throw e;
  }
}
