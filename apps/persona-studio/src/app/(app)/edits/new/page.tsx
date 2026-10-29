import { readdirSync } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ArrowLeft } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { EditForm } from '@/components/edit-form';
import { EmptyState } from '@/components/empty-state';
import { COSTS } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Новый монтаж — Persona Studio' };

// Template previews are added by hand (public/template-previews/README.md);
// only request the ones that exist, otherwise every card logs a 404.
function shippedPreviews(): string[] {
  try {
    return readdirSync(path.join(process.cwd(), 'public/template-previews'))
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}

export default async function NewEditPage({ searchParams }: { searchParams: Promise<{ videoId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { videoId } = await searchParams;

  const videos = await prisma.videoGeneration.findMany({
    where: { userId: user.id, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    include: { avatar: { select: { id: true, styleLabel: true, imageUrl: true } } },
    take: 30,
  });

  return (
    <div className="grid gap-4">
      <header className="panel flex flex-wrap items-center gap-3 !rounded-2xl px-4 py-3">
        <Icon3D name="videos" size={20} tile />
        <span className="sec-num">/00</span>
        <span className="sec-title">Новый монтаж · Submagic</span>
        <span className="flex-1" />
        <Link href="/edits" className="btn-ghost !px-4 !py-2 text-[13px]">
          <ArrowLeft size={14} /> весь монтаж
        </Link>
      </header>

      {videos.length === 0 ? (
        <EmptyState
          kind="need-video"
          title="Сначала нужно хотя бы одно готовое видео."
          description="Submagic монтирует уже готовое MP4 — собери его в разделе «Видео» и возвращайся."
          cta={{ href: '/videos/new', label: 'Создать видео' }}
        />
      ) : (
        <EditForm
          videos={videos.map((v) => ({
            id: v.id,
            videoUrl: v.videoUrl,
            aspect: v.aspect,
            createdAt: v.createdAt.toISOString(),
            avatar: v.avatar,
            script: v.script,
          }))}
          initialVideoId={videoId}
          cost={COSTS.submagicEdit}
          previews={shippedPreviews()}
        />
      )}
    </div>
  );
}
