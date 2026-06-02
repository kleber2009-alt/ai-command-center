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
          id: reel.id,
          url: reel.url,
          videoUrl: reel.videoUrl,
          thumbnailUrl: reel.thumbnailUrl,
          caption: reel.caption,
          postedAt: reel.postedAt?.toISOString() ?? null,
          views: reel.views,
          likes: reel.likes,
          comments: reel.comments,
          shares: reel.shares,
          durationSec: reel.durationSec,
          virality: reel.virality,
          engagementRate: reel.engagementRate,
          velocity: reel.velocity,
          viralScore: reel.viralScore,
          reach: reel.reach,
          language: reel.language,
          hashtags: reel.hashtags,
          author: {
            id: reel.author.id,
            username: reel.author.username,
            followers: reel.author.followers,
            medianViews: reel.author.medianViews,
            avatarUrl: reel.author.avatarUrl,
          },
          transcripts: reel.transcripts.map((t) => ({
            id: t.id,
            text: t.text,
            improved: t.improved,
            source: t.source,
            lang: t.lang,
            createdAt: t.createdAt.toISOString(),
          })),
          analyses: reel.analyses.map((a) => ({
            id: a.id,
            hooks: a.hooks,
            storytelling: a.storytelling,
            format: a.format,
            style: a.style,
            whyViral: a.whyViral,
            recommendations: a.recommendations,
            createdAt: a.createdAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}
