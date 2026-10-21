import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
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
    style: draft.style,
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
      <div className="panel flex flex-wrap items-center justify-between gap-4 !rounded-2xl px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Icon3D name="carousel" size={20} tile />
          <span className="sec-num">/00</span>
          <span className="sec-title">Carousel · черновик</span>
          {draft.parserItem && (
            <div className="ml-1 hidden items-center gap-2 text-[12px] text-text-mute sm:flex">
              <span className="rounded-full bg-lime/15 px-2 py-0.5 font-medium text-lime">/parser</span>
              {draft.parserItem.owner && (
                <span className="text-text">@{draft.parserItem.owner}</span>
              )}
              {draft.parserItem.fitScore != null && (
                <span className="font-semibold text-gold">{draft.parserItem.fitScore}/10</span>
              )}
              <a
                href={draft.parserItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-lime hover:bg-lime/10"
                aria-label="Открыть источник"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>
        <Link
          href="/carousels"
          className="btn-ghost !px-4 !py-2 text-[13px]"
        >
          <ArrowLeft size={14} /> все черновики
        </Link>
      </div>

      <CarouselEditorShell initial={serialized} avatars={avatars} />
    </div>
  );
}
