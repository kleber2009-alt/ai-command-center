import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWebhookSignature, getInvoice } from '@/lib/cryptobot';
import { creditTokens } from '@/lib/tokens';

export const runtime = 'nodejs';

// CryptoBot webhook signature header.
const SIG_HEADER = 'crypto-pay-api-signature';

type WebhookPayload = {
  update_id?: number;
  update_type?: string;       // 'invoice_paid'
  request_date?: string;
  payload?: {
    invoice_id?: number;
    status?: string;
    asset?: string;
    amount?: string;
    paid_at?: string;
    payload?: string;
  };
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get(SIG_HEADER) ?? '';

  if (!sig || !verifyWebhookSignature(raw, sig)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  let data: WebhookPayload;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (data.update_type !== 'invoice_paid' || !data.payload?.invoice_id) {
    // Не наш case — отвечаем 200, чтобы CryptoBot не ретраил.
    return NextResponse.json({ ok: true });
  }

  const invoiceId = String(data.payload.invoice_id);
  const row = await prisma.cryptoInvoice.findUnique({ where: { invoiceId } });
  if (!row) {
    // Не наша запись. Возможно, тестовый пинг. 200 чтобы не зацикливать.
    return NextResponse.json({ ok: true, note: 'unknown_invoice' });
  }

  if (row.status === 'paid') {
    return NextResponse.json({ ok: true, note: 'already_paid' });
  }

  // Двойная проверка через API — защита от подделки payload даже при валидной подписи.
  const remote = await getInvoice(invoiceId).catch(() => null);
  if (!remote || remote.status !== 'paid') {
    return NextResponse.json({ ok: false, note: 'not_paid_on_api' }, { status: 409 });
  }

  // Two-step idempotent flip:
  //   1) updateMany WHERE status='active' — выигрывает один параллельный запрос.
  //   2) если выиграли — credit через свой собственный $transaction.
  const flipped = await prisma.cryptoInvoice.updateMany({
    where: { invoiceId, status: 'active' },
    data: { status: 'paid', paidAt: new Date(remote.paid_at ?? Date.now()) },
  });
  if (flipped.count === 0) {
    return NextResponse.json({ ok: true, note: 'already_paid_race' });
  }

  await creditTokens({
    userId: row.userId,
    amount: row.tokens,
    type: 'purchase',
    reason: `cryptobot:${row.pack}:${invoiceId}`,
    refId: row.id,
  });

  return NextResponse.json({ ok: true, credited: row.tokens });
}
