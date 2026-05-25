import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EditForm } from '@/components/edit-form';
import { COSTS } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New edit — Persona Studio' };

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
      <header className="flex items-baseline gap-3">
        <span className="sec-num">/00</span>
        <span className="sec-title">New edit · Submagic</span>
        <span className="flex-1 border-b border-border translate-y-[-3px]" />
        <Link href="/edits" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
          ← all edits
        </Link>
      </header>

      {videos.length === 0 ? (
        <div className="border border-border-2 border-dashed p-8 text-center bg-surface">
          <div className="sec-num mb-2">/NO-VIDEOS</div>
          <div className="font-serif italic text-[20px] mb-3">
            Сначала нужно хотя бы одно готовое видео.
          </div>
          <Link href="/videos/new" className="btn-primary">Создать видео →</Link>
        </div>
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
        />
      )}
    </div>
  );
}
