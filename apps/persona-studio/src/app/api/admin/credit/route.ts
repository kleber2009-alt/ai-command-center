import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/auth';
import { creditTokens } from '@/lib/tokens';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  userId: z.string().min(1),
  amount: z.number().int().refine((n) => n !== 0, 'amount cannot be zero').refine((n) => Math.abs(n) <= 100000, 'too large'),
  reason: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { userId, amount, reason } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  if (amount > 0) {
    await creditTokens({
      userId,
      amount,
      type: 'manual',
      reason: reason ?? `admin:${admin.email}`,
    });
  } else {
    // отрицательное значение — списать вручную; пишем как manual с отрицательной суммой
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
      if (!user) throw new Error('USER_GONE');
      if (user.tokenBalance + amount < 0) {
        // не уходим в минус; обнуляем
        await tx.user.update({ where: { id: userId }, data: { tokenBalance: 0 } });
        await tx.tokenTransaction.create({
          data: {
            userId,
            amount: -user.tokenBalance,
            type: 'manual',
            reason: reason ?? `admin:${admin.email}:cap-to-zero`,
          },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: amount } },
        });
        await tx.tokenTransaction.create({
          data: {
            userId,
            amount,
            type: 'manual',
            reason: reason ?? `admin:${admin.email}`,
          },
        });
      }
    });
  }

  const fresh = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, tokenBalance: true },
  });
  return NextResponse.json({ ok: true, user: fresh });
}
