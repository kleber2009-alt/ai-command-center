import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { BRIEF_INCLUDE, serializeBrief } from '@/lib/studio/brief';
import { WorkspaceClient } from '@/components/studio/workspace-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Генерация — Persona Studio' };

export default async function BriefWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { id } = await params;

  const brief = await prisma.brief.findFirst({ where: { id, userId: user.id }, include: BRIEF_INCLUDE });
  if (!brief) notFound();

  // Готовность персоны к стадии «Видео» (нужны аватар + голос).
  let personaReady: { hasAvatar: boolean; hasVoice: boolean; name: string | null } = {
    hasAvatar: false,
    hasVoice: false,
    name: null,
  };
  if (brief.personaId) {
    const p = await prisma.persona.findUnique({
      where: { id: brief.personaId },
      select: { name: true, avatarId: true, voiceId: true },
    });
    if (p) personaReady = { hasAvatar: !!p.avatarId, hasVoice: !!p.voiceId, name: p.name };
  }

  return <WorkspaceClient initialBrief={serializeBrief(brief)} personaReady={personaReady} />;
}
