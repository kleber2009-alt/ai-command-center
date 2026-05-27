import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CoverForm } from '@/components/cover-form';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New cover — Persona Studio' };

export default async function NewCoverPage({ searchParams }: { searchParams: Promise<{ avatarId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
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
          <span className="sec-title">New carousel cover</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/covers" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
            ← all covers
          </Link>
        </div>
        <h1 className="font-serif text-[44px] leading-tight max-w-[20ch]">
          Виральная обложка <span className="italic text-warm">за один промпт.</span>
        </h1>
      </header>

      {avatars.length === 0 ? (
        <EmptyState
          kind="need-avatar"
          title="Сначала нужен хотя бы один готовый аватар."
          description="Загрузи селфи — через ~60 секунд вернёмся к обложке с готовым лицом."
          cta={{ href: '/generate?need=cover', label: 'Загрузить фото' }}
        />
      ) : (
        <CoverForm avatars={avatars} initialAvatarId={avatarId} />
      )}
    </div>
  );
}
