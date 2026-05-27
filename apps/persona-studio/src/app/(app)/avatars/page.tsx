import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AvatarGrid } from '@/components/avatar-grid';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/utils';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avatars — Persona Studio' };

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
          <header>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="sec-num">/00</span>
              <span className="sec-title">live render</span>
              <span className="flex-1 border-b border-border translate-y-[-3px]" />
              <Link href="/avatars" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
                ← все батчи
              </Link>
            </div>
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
        eyebrow="LIBRARY · AVATARS"
        title={
          <>
            All avatar <span className="italic text-gold">batches.</span>
          </>
        }
        description="Каждый батч — одно загруженное селфи, развёрнутое Gemini в десять портретов в разных стилях."
        actions={[{ label: 'New batch', href: '/generate' }]}
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">Batches</div>
            <div className="font-serif text-[28px] text-gold leading-none">{generations.length}</div>
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
        <div className="grid gap-2">
          {generations.map((g) => (
            <Link
              key={g.id}
              href={`/avatars?generationId=${g.id}`}
              className="border border-border bg-surface hover:bg-surface-2 transition-colors px-4 sm:px-5 py-4 grid grid-cols-[1fr_auto] gap-3 sm:gap-4 items-center"
            >
              <div className="grid gap-2 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="mono text-[10px] tracking-widest uppercase text-lime">/{g.status}</span>
                  <span className="font-serif italic text-[16px] sm:text-[18px]">batch {g.id.slice(0, 6)}</span>
                  <span className="mono text-[9px] sm:text-[10px] tracking-widest text-text-mute">{formatDate(g.createdAt)}</span>
                </div>
                {g.avatars.length > 0 && (
                  <div className="flex gap-1 overflow-hidden">
                    {g.avatars.map((a) => (
                      <div
                        key={a.id}
                        className="w-10 h-12 sm:w-12 sm:h-14 bg-surface-2 border border-border shrink-0"
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
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute whitespace-nowrap text-right">
                {g._count.avatars}/10 →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
