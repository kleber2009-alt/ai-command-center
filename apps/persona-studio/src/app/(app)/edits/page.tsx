import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ArrowDown } from 'lucide-react';
import { EditCard } from '@/components/edit-card';
import { EmptyState } from '@/components/empty-state';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Монтаж — Persona Studio' };

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
        eyebrow="монтаж готовых видео"
        title={
          <>
            Готовые видео — <span className="italic text-gold">с монтажом.</span>
          </>
        }
        description="Берём твой mp4, накладываем шаблон в стиле известных авторов и автоматические субтитры. На выходе — готовый Reels / Shorts."
        actions={
          latestVideo
            ? [{ label: 'Новый монтаж', href: `/edits/new?videoId=${latestVideo.id}` }]
            : [{ label: 'Сначала нужно видео', href: '/videos', tone: 'ghost' }]
        }
        icon="videos"
        meta={
          <>
            <div className="label">Рендеры</div>
            <div className="text-[40px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-gold">{edits.length}</div>
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
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-text-mute">
          листай · карточка {focus.slice(0, 8)} <ArrowDown size={13} />
        </p>
      )}
    </div>
  );
}
