// Create a Telegram Stars invoice link.
// Returns an `invoiceLink` that the Mini App opens via
// `Telegram.WebApp.openInvoice(link, callback)`. After payment, Telegram
// sends `successful_payment` to the bot webhook (/api/telegram/webhook),
// which credits tokens.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createStarsInvoiceLink, STARS_PACKS, type StarsPackSlug } from '@/lib/telegram-tma';

export const runtime = 'nodejs';

const Body = z.object({
  pack: z.enum(['trial', 'starter', 'pro', 'agency']),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  const pack = parsed.data.pack as StarsPackSlug;
  const cfg = STARS_PACKS[pack];

  if (pack === 'trial') {
    const existing = await prisma.cryptoInvoice.findFirst({
      where: { userId: user.id, pack: 'trial', status: { in: ['paid', 'active'] } },
    });
    if (existing) {
      return NextResponse.json({ error: 'trial_already_used', status: existing.status }, { status: 409 });
    }
  }

  // Persist our row first so we have a stable id to put into the payload.
  const row = await prisma.cryptoInvoice.create({
    data: {
      userId: user.id,
      // Unique id; replaced with real invoice payload, which is what webhook uses to match.
      invoiceId: `stars:${user.id}:${pack}:${Date.now()}`,
      pack,
      tokens: cfg.tokens,
      asset: 'XTR',
      amount: String(cfg.stars),
      status: 'active',
      payUrl: '',                            // filled below
    },
  });

  try {
    const link = await createStarsInvoiceLink({
      title: `Persona Studio · ${cfg.label}`,
      description: `${cfg.tokens} токенов — ${cfg.perks}`,
      payload: row.id,                       // we look this up in successful_payment
      stars: cfg.stars,
    });
    await prisma.cryptoInvoice.update({ where: { id: row.id }, data: { payUrl: link } });
    return NextResponse.json({
      id: row.id,
      payUrl: link,
      asset: 'XTR',
      amount: String(cfg.stars),
      tokens: cfg.tokens,
    });
  } catch (e) {
    await prisma.cryptoInvoice.update({ where: { id: row.id }, data: { status: 'failed' } });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'stars_create_failed', detail: msg.slice(0, 300) }, { status: 502 });
  }
}
