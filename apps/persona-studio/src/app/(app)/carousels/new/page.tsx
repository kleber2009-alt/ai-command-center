import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CarouselEditorShell } from '@/components/carousel/carousel-editor-shell';
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
    <div className="grid gap-3">
      {/* Compact top-bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="sec-num">/00</span>
          <span className="sec-title">Carousel · черновик</span>
          {draft.parserItem && (
            <div className="hidden sm:flex items-center gap-2 mono text-[10px] tracking-[0.16em] uppercase text-text-mute ml-3">
              <span className="text-lime">/parser</span>
              {draft.parserItem.owner && (
                <span className="text-text">@{draft.parserItem.owner}</span>
              )}
              {draft.parserItem.fitScore != null && (
                <span className="text-warm">{draft.parserItem.fitScore}/10</span>
              )}
              <a
                href={draft.parserItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime hover:underline"
              >
                ↗
              </a>
            </div>
          )}
        </div>
        <Link
          href="/carousels"
          className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute hover:text-text"
        >
          ← все черновики
        </Link>
      </div>

      <CarouselEditorShell initial={serialized} avatars={avatars} />
    </div>
  );
}
