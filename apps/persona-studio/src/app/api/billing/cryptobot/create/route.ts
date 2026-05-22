import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createInvoice, PACKS, type PackSlug } from '@/lib/cryptobot';

export const runtime = 'nodejs';

const Body = z.object({
  pack: z.enum(['starter', 'pro', 'agency']),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const pack = parsed.data.pack as PackSlug;
  const cfg = PACKS[pack];

  try {
    const invoice = await createInvoice({
      asset: 'USDT',
      amount: cfg.usdt,
      description: `Persona Studio · ${cfg.label} · ${cfg.tokens} tokens`,
      payload: JSON.stringify({ userId: user.id, pack, tokens: cfg.tokens }),
      paidBtnName: 'openBot',
      paidBtnUrl: process.env.NEXTAUTH_URL
        ? `${process.env.NEXTAUTH_URL}/billing?paid=${pack}`
        : undefined,
      expiresIn: 60 * 60,                     // 1 hour to pay
    });

    const row = await prisma.cryptoInvoice.create({
      data: {
        userId: user.id,
        invoiceId: String(invoice.invoice_id),
        pack,
        tokens: cfg.tokens,
        asset: invoice.asset,
        amount: invoice.amount,
        status: 'active',
        payUrl: invoice.bot_invoice_url,
      },
    });

    return NextResponse.json({
      id: row.id,
      invoiceId: row.invoiceId,
      payUrl: row.payUrl,
      asset: row.asset,
      amount: row.amount,
      tokens: row.tokens,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'cryptobot_create_failed', detail: msg.slice(0, 300) }, { status: 502 });
  }
}
