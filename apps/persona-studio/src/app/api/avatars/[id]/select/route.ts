import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const avatar = await prisma.avatar.findFirst({ where: { id, userId: user.id } });
  if (!avatar) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.$transaction([
    prisma.avatar.updateMany({
      where: { userId: user.id, generationId: avatar.generationId, selected: true },
      data: { selected: false },
    }),
    prisma.avatar.update({ where: { id }, data: { selected: true } }),
  ]);

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const avatar = await prisma.avatar.findFirst({ where: { id, userId: user.id } });
  if (!avatar) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.avatar.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
