import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AvatarGrid } from '@/components/avatar-grid';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/utils';
import { PageHero } from '@/components/shell/page-hero';
import { statusLabel } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Аватары — Persona Studio' };

export default async function AvatarsPage({ searchParams }: { searchParams: Promise<{ generationId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { generationId } = await searchParams;

  if (generationId) {
    const exists = await prisma.avatarGeneration.findFirst({
      where: { id: generationId, userId: user.id },
      select: { id: true },
    });
    if (exists) {
      return (
        <div className="grid gap-8">
          <header className="reveal flex flex-wrap items-center gap-3">
            <Link href="/avatars" className="btn-ghost !px-4 !py-2 text-[13px]">
              <ArrowLeft size={14} aria-hidden />
              все батчи
            </Link>
            <span className="sec-num">/00</span>
            <span className="sec-title">рендер в реальном времени</span>
          </header>
          <AvatarGrid generationId={exists.id} />
        </div>
      );
    }
  }

  const generations = await prisma.avatarGeneration.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { avatars: true } },
      avatars: { where: { status: 'done' }, take: 5, orderBy: { createdAt: 'asc' } },
    },
  });

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="БИБЛИОТЕКА · АВАТАРЫ"
        title={
          <>
            Все батчи <span className="italic">аватаров.</span>
          </>
        }
        description="Каждый батч — одно загруженное селфи, развёрнутое Gemini в десять портретов в разных стилях."
        icon="avatar"
        actions={[{ label: 'Новый батч', href: '/generate' }]}
        meta={
          <>
            <div className="label">Батчи</div>
            <div className="text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-gold">{generations.length}</div>
          </>
        }
      />

      {generations.length === 0 ? (
        <EmptyState
          title="Ещё ни одного батча."
          description="Загрузи селфи — через ~60 секунд получишь 10 портретов в разных стилях."
          cta={{ href: '/generate', label: 'Загрузить фото' }}
        />
      ) : (
        <div className="stagger grid gap-3">
          {generations.map((g) => (
            <Link
              key={g.id}
              href={`/avatars?generationId=${g.id}`}
              className="card-editorial group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5"
            >
              <div className="grid min-w-0 gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`status-badge status-${g.status === 'pending' ? 'queued' : g.status}`}>{statusLabel(g.status)}</span>
                  <span className="text-[16px] font-semibold tracking-[-0.02em] sm:text-[17px]">батч {g.id.slice(0, 6)}</span>
                  <span className="text-[12px] text-text-mute tabular-nums">{formatDate(g.createdAt)}</span>
                </div>
                {g.avatars.length > 0 && (
                  <div className="flex gap-1.5 overflow-hidden">
                    {g.avatars.map((a) => (
                      <div
                        key={a.id}
                        className="h-12 w-10 shrink-0 rounded-xl border border-border-soft bg-surface-2 sm:h-14 sm:w-12"
                        style={
                          a.imageUrl
                            ? { backgroundImage: `url(${a.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
              <span className="flex items-center gap-1 whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-text-dim transition-colors group-hover:text-text">
                {g._count.avatars}/10
                <ChevronRight size={16} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
