import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { BRIEF_INCLUDE, serializeBrief } from '@/lib/studio/brief';
import { BriefsClient } from '@/components/studio/briefs-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Воркспейс — Persona Studio' };

export default async function BriefsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const [briefs, personas] = await Promise.all([
    prisma.brief.findMany({
      where: { userId: user.id },
      include: BRIEF_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.persona.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  return (
    <BriefsClient
      initialBriefs={briefs.map(serializeBrief)}
      personas={personas.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }))}
    />
  );
}
