import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const generationId = req.nextUrl.searchParams.get('generationId');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);

  const avatars = await prisma.avatar.findMany({
    where: {
      userId: user.id,
      ...(generationId ? { generationId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ avatars });
}
