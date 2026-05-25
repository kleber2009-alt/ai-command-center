import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CarouselEditor } from '@/components/carousel/carousel-editor';
import type { CarouselDraftSerialized, SlideShape } from '@/components/carousel/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Carousel — Persona Studio' };

export default async function NewCarouselPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { draftId } = await searchParams;

  if (!draftId) redirect('/carousels');

  const draft = await prisma.carouselDraft.findFirst({
    where: { id: draftId, userId: user.id },
    include: {
      coverAvatar: { select: { id: true, styleLabel: true, imageUrl: true } },
      parserItem: { select: { id: true, url: true, owner: true, fitScore: true } },
    },
  });
  if (!draft) redirect('/carousels');

  const avatars = await prisma.avatar.findMany({
    where: { userId: user.id, status: 'done' },
    orderBy: [{ selected: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, styleLabel: true, imageUrl: true },
    take: 60,
  });

  const slides = Array.isArray(draft.slides) ? (draft.slides as unknown as SlideShape[]) : [];
  const serialized: CarouselDraftSerialized = {
    id: draft.id,
    parserItemId: draft.parserItemId,
    coverAvatarId: draft.coverAvatarId,
    slidesCount: draft.slidesCount,
    slides,
    status: draft.status,
    imageUrls: draft.imageUrls,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    coverAvatar: draft.coverAvatar,
    parserItem: draft.parserItem,
  };

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Carousel · черновик</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/carousels" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
            ← все черновики
          </Link>
        </div>
        <h1 className="font-serif text-[28px] sm:text-[36px] md:text-[44px] leading-tight max-w-[24ch]">
          {draft.parserItem
            ? <>Карусель по референсу — <span className="italic text-warm">переписана под тебя.</span></>
            : <>Карусель с нуля — <span className="italic text-warm">подкрути слайды.</span></>}
        </h1>
        <p className="font-serif text-[14px] sm:text-[16px] text-text-dim mt-3 max-w-[60ch]">
          Claude уже разбил оригинал на {slides.length} слайда{slides.length === 1 ? '' : slides.length < 5 ? 'а' : 'ов'} по структуре обложка → раскрытие → CTA. Подправь текст, выбери аватар для обложки, сохрани. Финальный рендер PNG'ов — следующий шаг.
        </p>
      </header>

      {draft.parserItem && (
        <div className="border border-lime/40 bg-lime/[0.04] p-3 sm:p-4 flex items-center gap-3 flex-wrap">
          <span className="mono text-[10px] tracking-widest uppercase text-lime">/parser · референс</span>
          {draft.parserItem.owner && (
            <span className="mono text-[11px] text-text">@{draft.parserItem.owner}</span>
          )}
          {draft.parserItem.fitScore != null && (
            <span className="mono text-[11px] text-warm">{draft.parserItem.fitScore}/10</span>
          )}
          <a
            href={draft.parserItem.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-[10px] tracking-widest uppercase text-lime hover:underline ml-auto"
          >
            Открыть оригинал в Instagram ↗
          </a>
        </div>
      )}

      <CarouselEditor initial={serialized} avatars={avatars} />
    </div>
  );
}
