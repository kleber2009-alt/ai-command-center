// DELETE /api/schedule/accounts/:id — disconnect a channel.
// Marks the account 'revoked' and clears the stored token (keeps row for
// historical PostTarget references via onDelete: Cascade would remove them, so
// we soft-disable instead).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const account = await prisma.socialAccount.findFirst({ where: { id, userId: ctx.user.id } });
  if (!account) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { status: 'revoked', accessToken: null },
  });
  return NextResponse.json({ ok: true });
}
