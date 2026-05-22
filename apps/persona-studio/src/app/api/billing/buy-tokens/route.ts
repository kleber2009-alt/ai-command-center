import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { creditTokens } from '@/lib/tokens';

export const runtime = 'nodejs';

const Body = z.object({
  pack: z.enum(['starter', 'pro', 'agency']),
});

const PACKS: Record<z.infer<typeof Body>['pack'], { tokens: number; usd: number; plan: string }> = {
  starter: { tokens: 100, usd: 19, plan: 'starter' },
  pro: { tokens: 400, usd: 49, plan: 'pro' },
  agency: { tokens: 1200, usd: 99, plan: 'agency' },
};

/**
 * Заглушка — в проде сюда придёт Stripe webhook.
 * Для MVP-локалки даёт мгновенный credit для тестирования flow.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  const pack = PACKS[parsed.data.pack];

  await creditTokens({
    userId: user.id,
    amount: pack.tokens,
    type: 'purchase',
    reason: `pack:${parsed.data.pack}:dev`,
  });

  return NextResponse.json({
    ok: true,
    pack: parsed.data.pack,
    tokensAdded: pack.tokens,
    note: 'dev_stub — реальный платёж через Stripe ещё не подключён',
  });
}
