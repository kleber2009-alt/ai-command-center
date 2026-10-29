// Voices visible to a user: clones labelled with their id in the shared
// ElevenLabs account, plus legacy clones already attached to their personas
// or videos (created before owner labels existed).

import { prisma } from '@/lib/prisma';
import { listClonedVoices, type ClonedVoice } from '@/lib/elevenlabs';

export async function listOwnedVoices(userId: string): Promise<ClonedVoice[]> {
  const [personas, videos] = await Promise.all([
    prisma.persona.findMany({ where: { userId, voiceId: { not: null } }, select: { voiceId: true } }),
    prisma.videoGeneration.findMany({
      where: { userId, voiceId: { not: null } },
      select: { voiceId: true },
      distinct: ['voiceId'],
    }),
  ]);
  const known = [...personas, ...videos].map((r) => r.voiceId).filter((v): v is string => !!v);
  return listClonedVoices(userId, known);
}
