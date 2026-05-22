import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VideoForm } from '@/components/video-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New video — Persona Studio' };

export default async function NewVideoPage({ searchParams }: { searchParams: Promise<{ avatarId?: string }> }) {
  const user = (await getCurrentUser())!;
  const { avatarId } = await searchParams;

  const avatars = await prisma.avatar.findMany({
    where: { userId: user.id, status: 'done' },
    orderBy: [{ selected: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, style: true, styleLabel: true, imageUrl: true },
    take: 60,
  });

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">New talking-photo video</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/videos" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
            ← all videos
          </Link>
        </div>
        <h1 className="font-serif text-[44px] leading-tight max-w-[22ch]">
          Твой аватар <span className="italic text-warm">говорит твоим голосом.</span>
        </h1>
        <p className="font-serif text-[16px] text-text-dim mt-3 max-w-[60ch]">
          HeyGen возьмёт выбранного аватара, оживит губы под скрипт и выдаст MP4 за 2–4 минуты. Списывается 30 токенов.
        </p>
      </header>

      {avatars.length === 0 ? (
        <div className="border border-border-2 border-dashed p-12 text-center bg-surface">
          <div className="sec-num mb-3">/NO-AVATARS</div>
          <div className="font-serif italic text-[22px] mb-4">
            Сначала нужен хотя бы один готовый аватар.
          </div>
          <Link href="/generate" className="btn-primary">Загрузить фото →</Link>
        </div>
      ) : (
        <VideoForm avatars={avatars} initialAvatarId={avatarId} />
      )}
    </div>
  );
}
