import { redirect } from 'next/navigation';
import { ArrowDown } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VideoCard } from '@/components/video-card';
import { EmptyState } from '@/components/empty-state';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Видео — Persona Studio' };

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { focus } = await searchParams;

  const [videos, selectedAvatar] = await Promise.all([
    prisma.videoGeneration.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { avatar: { select: { id: true, styleLabel: true, imageUrl: true } } },
      take: 50,
    }),
    prisma.avatar.findFirst({
      where: { userId: user.id, selected: true, status: 'done' },
      select: { id: true, styleLabel: true, imageUrl: true },
    }),
  ]);

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="БИБЛИОТЕКА · ВИДЕО"
        title={
          <>
            Видео с <span className="italic">говорящим фото.</span>
          </>
        }
        description="HeyGen берёт выбранного аватара, оживляет губы под скрипт и выдаёт MP4 за 2–4 минуты."
        actions={
          selectedAvatar
            ? [
                { label: `Новое видео · ${selectedAvatar.styleLabel}`, href: `/videos/new?avatarId=${selectedAvatar.id}` },
                { label: 'Монтаж', href: '/edits', tone: 'ghost' },
              ]
            : [
                { label: 'Выбрать аватара', href: '/avatars' },
                { label: 'Монтаж', href: '/edits', tone: 'ghost' },
              ]
        }
        icon="videos"
        meta={
          <>
            <div className="label">В библиотеке</div>
            <div className="text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-gold">{videos.length}</div>
          </>
        }
      />

      {videos.length === 0 ? (
        selectedAvatar ? (
          <EmptyState
            title="Видео ещё нет. Соберём первое прямо сейчас?"
            description="HeyGen возьмёт выбранного аватара, оживит губы под скрипт и выдаст MP4 за 2–4 минуты."
            cta={{
              href: `/videos/new?avatarId=${selectedAvatar.id}`,
              label: `Создать видео из ${selectedAvatar.styleLabel}`,
            }}
          />
        ) : (
          <EmptyState
            kind="need-avatar"
            title="Сначала выбери аватара, потом возвращайся."
            description="Отметь нужный портрет основным в списке аватаров — он станет лицом всех будущих видео."
            cta={{ href: '/avatars', label: 'К аватарам' }}
          />
        )
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              autopoll={v.status === 'pending' || v.status === 'processing'}
              initial={{
                ...v,
                createdAt: v.createdAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}

      {focus && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-text-mute">
          листай · карточка {focus.slice(0, 8)}
          <ArrowDown size={13} aria-hidden />
        </p>
      )}
    </div>
  );
}
