import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 100), 500);

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { id: { equals: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      email: true,
      name: true,
      tokenBalance: true,
      plan: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          avatarGenerations: true,
          covers: true,
          videoGenerations: true,
        },
      },
    },
  });

  return NextResponse.json({ users });
}
