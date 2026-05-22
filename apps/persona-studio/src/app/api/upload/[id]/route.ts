import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const upload = await prisma.upload.findFirst({ where: { id, userId: user.id } });
  if (!upload) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const usedBy = await prisma.avatarGeneration.count({ where: { uploadId: id } });
  if (usedBy > 0) {
    await prisma.upload.update({ where: { id }, data: { status: 'deleted' } });
    return NextResponse.json({ ok: true, soft: true, batches: usedBy });
  }

  await prisma.upload.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
