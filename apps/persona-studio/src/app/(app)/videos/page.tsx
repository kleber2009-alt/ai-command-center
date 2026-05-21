import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VideoCard } from '@/components/video-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Videos — Persona Studio' };

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const user = (await getCurrentUser())!;
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
        <h1 className="font-serif text-[44px] leading-tight max-w-[22ch]">
          Все говорящие <span className="italic text-warm">видео.</span>
        </h1>
      </header>

      {videos.length === 0 ? (
        <div className="border border-border-2 border-dashed p-12 text-center bg-surface">
          <div className="sec-num mb-3">/EMPTY</div>
          <div className="font-serif italic text-[22px] mb-4">
            {selectedAvatar
              ? 'Видео ещё нет. Соберём первое прямо сейчас?'
              : 'Сначала выбери аватара на /avatars, потом возвращайся.'}
          </div>
          {selectedAvatar ? (
            <Link href={`/videos/new?avatarId=${selectedAvatar.id}`} className="btn-primary">
              Создать видео из {selectedAvatar.styleLabel} →
            </Link>
          ) : (
            <Link href="/avatars" className="btn-primary">К аватарам →</Link>
          )}
        </div>
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
