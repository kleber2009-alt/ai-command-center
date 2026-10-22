import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CoverForm } from '@/components/cover-form';
import { EmptyState } from '@/components/empty-state';
import { PageHero } from '@/components/shell/page-hero';
import { ArrowLeft } from 'lucide-react';
import { COSTS } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Новая обложка — Persona Studio' };

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
      <div className="-mb-4 flex flex-wrap items-center gap-3">
        <Link href="/covers" className="btn-ghost !px-4 !py-2 text-[13px]">
          <ArrowLeft size={14} aria-hidden />
          все обложки
        </Link>
        <span className="sec-num">/00</span>
        <span className="sec-title">Новая обложка карусели</span>
      </div>

      <PageHero
        eyebrow="СОЗДАТЬ · ОБЛОЖКА"
        icon="covers"
        title={
          <>
            Виральная обложка <span className="italic">за один промпт.</span>
          </>
        }
      />

      {avatars.length === 0 ? (
        <EmptyState
          kind="need-avatar"
          title="Сначала нужен хотя бы один готовый аватар."
          description="Загрузи селфи — через ~60 секунд вернёмся к обложке с готовым лицом."
          cta={{ href: '/generate?need=cover', label: 'Загрузить фото' }}
        />
      ) : (
        <CoverForm avatars={avatars} initialAvatarId={avatarId} cost={COSTS.coverGeneration} />
      )}
    </div>
  );
}
