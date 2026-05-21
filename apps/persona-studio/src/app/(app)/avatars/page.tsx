import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AvatarGrid } from '@/components/avatar-grid';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avatars — Persona Studio' };

export default async function AvatarsPage({ searchParams }: { searchParams: Promise<{ generationId?: string }> }) {
  const user = (await getCurrentUser())!;
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
              <span className="sec-num">/AVATARS</span>
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
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">My avatars</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/generate" className="mono text-[10px] tracking-widest uppercase text-lime">
            new batch →
          </Link>
        </div>
        <h1 className="font-serif text-[44px] leading-tight max-w-[18ch]">
          Все батчи аватаров.
        </h1>
      </header>

      {generations.length === 0 ? (
        <div className="border border-border-2 border-dashed p-12 text-center bg-surface">
          <div className="sec-num mb-3">/EMPTY</div>
          <div className="font-serif italic text-[24px] mb-4">
            Ещё ни одного батча. Загрузи фото — построим 10.
          </div>
          <Link href="/generate" className="btn-primary">Загрузить фото →</Link>
        </div>
      ) : (
        <div className="grid gap-2">
          {generations.map((g) => (
            <Link
              key={g.id}
              href={`/avatars?generationId=${g.id}`}
              className="border border-border bg-surface hover:bg-surface-2 transition-colors px-5 py-4 grid grid-cols-[1fr_auto] gap-4 items-center"
            >
              <div className="grid gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="mono text-[10px] tracking-widest uppercase text-lime">/{g.status}</span>
                  <span className="font-serif italic text-[18px]">batch {g.id.slice(0, 6)}</span>
                  <span className="mono text-[10px] tracking-widest text-text-mute">{formatDate(g.createdAt)}</span>
                </div>
                {g.avatars.length > 0 && (
                  <div className="flex gap-1">
                    {g.avatars.map((a) => (
                      <div
                        key={a.id}
                        className="w-12 h-14 bg-surface-2 border border-border"
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
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                {g._count.avatars} / 10 done →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
