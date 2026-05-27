import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VideoCard } from '@/components/video-card';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Videos — Persona Studio' };

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
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">My talking-photo videos</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/edits" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
            montage →
          </Link>
          {selectedAvatar ? (
            <Link
              href={`/videos/new?avatarId=${selectedAvatar.id}`}
              className="mono text-[10px] tracking-widest uppercase text-lime"
            >
              new video · {selectedAvatar.styleLabel} →
            </Link>
          ) : (
            <Link href="/avatars" className="mono text-[10px] tracking-widest uppercase text-lime">
              choose avatar →
            </Link>
          )}
        </div>
        <h1 className="font-serif text-[28px] sm:text-[36px] md:text-[44px] leading-tight max-w-[22ch]">
          Все говорящие <span className="italic text-warm">видео.</span>
        </h1>
      </header>

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
            description="Сними галочку «primary» на нужном портрете в списке аватаров — он станет лицом всех будущих видео."
            cta={{ href: '/avatars', label: 'К аватарам' }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <p className="mono text-[10px] tracking-widest uppercase text-text-mute text-center">
          /scroll · карточка {focus.slice(0, 8)} ↓
        </p>
      )}
    </div>
  );
}
