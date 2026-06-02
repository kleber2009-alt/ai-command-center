// Детальная страница ролика — Модуль 2 ТЗ. Серверный компонент:
// тянем reel + author + последний analysis юзера + последний transcript,
// далее всё интерактивное в ReelDetailClient.

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ReelDetailClient } from '@/components/research/reel-detail-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Анализ ролика — Persona Studio' };

export default async function ReelDetailPage({
  params,
}: {
  params: Promise<{ reelId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { reelId } = await params;

  const reel = await prisma.researchReel.findUnique({
    where: { id: reelId },
    include: {
      author: true,
      transcripts: { orderBy: { createdAt: 'desc' }, take: 1 },
      analyses: {
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!reel) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/research"
          className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text"
        >
          ← Назад к выдаче
        </Link>
      </div>

      <ReelDetailClient
        reel={{
          ...reel,
          postedAt: reel.postedAt?.toISOString() ?? null,
          indexedAt: reel.indexedAt.toISOString(),
          updatedAt: reel.updatedAt.toISOString(),
          author: {
            ...reel.author,
            createdAt: reel.author.createdAt.toISOString(),
            updatedAt: reel.author.updatedAt.toISOString(),
            lastIndexedAt: reel.author.lastIndexedAt?.toISOString() ?? null,
            // Не отдаём rawStats — он большой
            rawStats: undefined,
          },
          transcripts: reel.transcripts.map((t) => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
          })),
          analyses: reel.analyses.map((a) => ({
            ...a,
            createdAt: a.createdAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}
