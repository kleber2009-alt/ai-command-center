import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Carousels — Persona Studio' };

export default async function CarouselsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const drafts = await prisma.carouselDraft.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      coverAvatar: { select: { id: true, styleLabel: true, imageUrl: true } },
      parserItem: { select: { owner: true, fitScore: true } },
    },
  });

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Carousels</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/parser" className="mono text-[10px] tracking-widest uppercase text-lime">
            из парсера →
          </Link>
        </div>
        <h1 className="font-serif text-[28px] sm:text-[36px] md:text-[44px] leading-tight max-w-[26ch]">
          Карусели — <span className="italic text-warm">сценарий, разбитый на слайды.</span>
        </h1>
        <p className="font-serif text-[14px] sm:text-[16px] text-text-dim mt-3 max-w-[60ch]">
          Берём найденный парсером пост, Claude разбивает его на N слайдов по структуре
          обложка → раскрытие → CTA. Первый слайд — твой аватар, остальные — уникализированные тексты.
        </p>
      </header>

      {drafts.length === 0 ? (
        <div className="border border-border-2 border-dashed p-12 text-center bg-surface">
          <div className="sec-num mb-3">/EMPTY</div>
          <div className="font-serif italic text-[22px] mb-4">
            Черновиков карусели пока нет.
          </div>
          <p className="font-serif text-[14px] text-text-mute mb-6 max-w-[42ch] mx-auto">
            Открой парсер, найди залётную карусель, нажми «Создать карусель» — и попадёшь сюда с готовыми слайдами.
          </p>
          <Link href="/parser" className="btn-primary">Открыть парсер →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((d) => {
            const slides = Array.isArray(d.slides) ? (d.slides as Array<{ title?: string }>) : [];
            const first = slides[0] || {};
            return (
              <Link
                key={d.id}
                href={`/carousels/new?draftId=${d.id}`}
                className="border border-border bg-surface p-4 grid gap-3 hover:border-text-dim transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                    /draft · {slides.length} sl.
                  </span>
                  <span className="mono text-[9px] text-text-mute">
                    {new Date(d.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  {d.coverAvatar?.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.coverAvatar.imageUrl}
                      alt={d.coverAvatar.styleLabel}
                      className="w-14 h-18 sm:w-16 sm:h-20 object-cover border border-border shrink-0"
                    />
                  )}
                  <div className="grid gap-1 min-w-0">
                    <p className="font-serif text-[15px] text-text leading-snug line-clamp-2">
                      {first.title || 'Без заголовка'}
                    </p>
                    {d.parserItem?.owner && (
                      <span className="mono text-[10px] text-text-mute">
                        @{d.parserItem.owner}
                        {d.parserItem.fitScore != null && (
                          <span className="text-warm ml-2">{d.parserItem.fitScore}/10</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
