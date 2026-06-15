import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PERSONA_INCLUDE, serializePersona } from '@/lib/studio/persona';
import { PersonasClient } from '@/components/persona/personas-client';
import type { PersonaAvatarOption } from '@/lib/studio/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Персоны — Persona Studio' };

export default async function PersonasPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const [personas, avatars] = await Promise.all([
    prisma.persona.findMany({
      where: { userId: user.id },
      include: PERSONA_INCLUDE,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.avatar.findMany({
      where: { userId: user.id, status: 'done' },
      select: { id: true, imageUrl: true, imageThumbUrl: true, styleLabel: true },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
  ]);

  const avatarOptions: PersonaAvatarOption[] = avatars.map((a) => ({
    id: a.id,
    imageUrl: a.imageUrl,
    imageThumbUrl: a.imageThumbUrl,
    styleLabel: a.styleLabel,
  }));

  return (
    <PersonasClient
      initialPersonas={personas.map(serializePersona)}
      avatarOptions={avatarOptions}
    />
  );
}
