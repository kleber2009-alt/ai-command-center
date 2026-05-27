import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EditCard } from '@/components/edit-card';
import { EmptyState } from '@/components/empty-state';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Montage — Persona Studio' };

export default async function EditsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { focus } = await searchParams;

  const [edits, latestVideo] = await Promise.all([
    prisma.videoEdit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        videoGeneration: {
          select: {
            id: true,
            aspect: true,
            videoUrl: true,
            avatar: { select: { id: true, styleLabel: true, imageUrl: true } },
          },
        },
      },
      take: 50,
    }),
    prisma.videoGeneration.findFirst({
      where: { userId: user.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="VIDEO PRODUCTION SUITE · SUBMAGIC"
        title={
          <>
            Finished videos — <span className="italic text-gold">edited.</span>
          </>
        }
        description="Submagic берёт твой mp4, накладывает шаблон в стиле известных авторов и автоматические субтитры. На выходе — готовый Reels / Shorts."
        actions={
          latestVideo
            ? [{ label: 'New edit', href: `/edits/new?videoId=${latestVideo.id}` }]
            : [{ label: 'Need a video first', href: '/videos', tone: 'ghost' }]
        }
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">Renders</div>
            <div className="font-serif text-[28px] text-gold leading-none">{edits.length}</div>
          </>
        }
      />

      {edits.length === 0 ? (
        latestVideo ? (
          <EmptyState
            title="Здесь будут смонтированные видео. Запустим первое?"
            description="Submagic накладывает шаблон в стиле известных авторов и автоматические субтитры — на выходе готовый Reels / Shorts."
            cta={{ href: `/edits/new?videoId=${latestVideo.id}`, label: 'В монтаж' }}
          />
        ) : (
          <EmptyState
            kind="need-video"
            title="Сначала нужно хотя бы одно готовое видео."
            description="Собери видео из аватара — его потом можно отправить в монтаж Submagic."
            cta={{ href: '/videos', label: 'К видео' }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {edits.map((e) => (
            <EditCard
              key={e.id}
              autopoll={e.status === 'pending' || e.status === 'processing'}
              initial={{
                ...e,
                createdAt: e.createdAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}

      {focus && (
        <p className="mono text-[10px] tracking-widest uppercase text-text-mute text-center">
          /scroll · карточка {focus.slice(0, 8)} ↓
        </p>
      )}
    </div>
  );
}
