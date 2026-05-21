import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tokenBalance: true, plan: true },
  });

  const recent = await prisma.tokenTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({
    balance: fresh?.tokenBalance ?? 0,
    plan: fresh?.plan ?? 'free',
    recent,
  });
}
