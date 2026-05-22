// @CryptoBot Telegram client.
//
// Docs: https://help.crypt.bot/crypto-pay-api
// Endpoint: https://pay.crypt.bot/api/<method>   (testnet: https://testnet-pay.crypt.bot/api/)
// Auth: HTTP-header `Crypto-Pay-API-Token: <token>` where token comes from
// @CryptoBot → My Apps → Create App → API Token.
//
// Webhook payload: { update_type: 'invoice_paid', payload: { invoice_id, status, ... } }
// Signature verification: hmac-sha256 of raw body with key = sha256(token).

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const TESTNET = process.env.CRYPTOBOT_TESTNET === 'true';
const API_BASE = TESTNET ? 'https://testnet-pay.crypt.bot/api' : 'https://pay.crypt.bot/api';

export class CryptoBotError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CryptoBotError';
  }
}

function tokenOrThrow(): string {
  const t = process.env.CRYPTOBOT_TOKEN;
  if (!t) throw new CryptoBotError('MISSING_TOKEN', 'CRYPTOBOT_TOKEN not set');
  return t;
}

type CreateInvoiceParams = {
  asset: 'USDT' | 'TON' | 'BTC' | 'ETH' | 'BNB' | 'TRX' | 'LTC' | 'USDC';
  amount: string;                          // "9.50" — string чтобы не терять точность
  description?: string;
  hiddenMessage?: string;                  // показывается после оплаты
  paidBtnName?: 'viewItem' | 'openChannel' | 'openBot' | 'callback';
  paidBtnUrl?: string;
  payload?: string;                        // до 4 КБ — наш ref (например cuid инвойса)
  expiresIn?: number;                      // секунд, 1..2629800
};

type CreateInvoiceResponse = {
  ok: boolean;
  result?: {
    invoice_id: number;
    hash: string;
    asset: string;
    amount: string;
    bot_invoice_url: string;
    mini_app_invoice_url?: string;
    web_app_invoice_url?: string;
    status: 'active' | 'paid' | 'expired';
    created_at: string;
    payload?: string;
  };
  error?: { code: number; name: string };
};

export async function createInvoice(p: CreateInvoiceParams): Promise<NonNullable<CreateInvoiceResponse['result']>> {
  const token = tokenOrThrow();
  const body: Record<string, unknown> = {
    asset: p.asset,
    amount: p.amount,
  };
  if (p.description) body.description = p.description;
  if (p.hiddenMessage) body.hidden_message = p.hiddenMessage;
  if (p.paidBtnName) body.paid_btn_name = p.paidBtnName;
  if (p.paidBtnUrl) body.paid_btn_url = p.paidBtnUrl;
  if (p.payload) body.payload = p.payload;
  if (p.expiresIn) body.expires_in = p.expiresIn;

  const res = await fetch(`${API_BASE}/createInvoice`, {
    method: 'POST',
    headers: {
      'Crypto-Pay-API-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new CryptoBotError(`HTTP_${res.status}`, (await res.text().catch(() => '')).slice(0, 400));
  }
  const data = (await res.json()) as CreateInvoiceResponse;
  if (!data.ok || !data.result) {
    throw new CryptoBotError(
      `API_${data.error?.code ?? 'UNKNOWN'}`,
      data.error?.name ?? 'createInvoice failed',
    );
  }
  return data.result;
}

type GetInvoicesResponse = {
  ok: boolean;
  result?: { items: Array<{ invoice_id: number; status: 'active' | 'paid' | 'expired'; paid_at?: string }> };
};

export async function getInvoice(invoiceId: string | number): Promise<NonNullable<GetInvoicesResponse['result']>['items'][number] | null> {
  const token = tokenOrThrow();
  const res = await fetch(`${API_BASE}/getInvoices?invoice_ids=${invoiceId}`, {
    headers: { 'Crypto-Pay-API-Token': token },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new CryptoBotError(`HTTP_${res.status}`, await res.text().catch(() => ''));
  const data = (await res.json()) as GetInvoicesResponse;
  return data.result?.items[0] ?? null;
}

/** Webhook signature: hmac-sha256(raw_body, key=sha256(token)) hex-encoded. */
export function verifyWebhookSignature(rawBody: string, signatureHex: string): boolean {
  const token = tokenOrThrow();
  const key = createHash('sha256').update(token).digest();
  const expected = createHmac('sha256', key).update(rawBody).digest('hex');
  if (expected.length !== signatureHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHex));
  } catch {
    return false;
  }
}

// ── Pack catalog ─────────────────────────────────────────
// 1 USDT ≈ 1 USD. Цены подобраны под стоимость операций
// (avatar batch 10, cover 3, video 30) с целевой маржой ~3x.

export type PackSlug = 'starter' | 'pro' | 'agency';

export const PACKS: Record<PackSlug, { tokens: number; usdt: string; label: string; perks: string }> = {
  starter: { tokens: 100, usdt: '9.00', label: 'Starter', perks: '~10 батчей аватаров или 33 обложки' },
  pro: { tokens: 400, usdt: '29.00', label: 'Pro', perks: '~13 видео + батчи аватаров' },
  agency: { tokens: 1200, usdt: '79.00', label: 'Agency', perks: 'безлимит на месяц для команды' },
};
