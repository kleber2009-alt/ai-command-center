import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

// Управление API-ключами для интеграции через SDK. Только session-auth
// (нельзя выпустить ключ ключом — иначе утечка одного даст бесконечный доступ).

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; scopes?: string };
  const name = String(body.name ?? '').trim().slice(0, 80) || 'default';
  const scopes = (body.scopes ?? 'read,write').trim();

  // 32 байта энтропии в base64url → 43 символа. С префиксом "ps_" итого 46.
  const raw = randomBytes(32).toString('base64url');
  const plaintext = `ps_${raw}`;
  const hashedKey = createHash('sha256').update(plaintext).digest('hex');
  const prefix = plaintext.slice(0, 8);

  const apiKey = await prisma.apiKey.create({
    data: { userId: user.id, name, prefix, hashedKey, scopes },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true },
  });

  return NextResponse.json({
    ...apiKey,
    // Plaintext возвращается ровно один раз — UI должен показать его юзеру.
    plaintext,
  });
}
