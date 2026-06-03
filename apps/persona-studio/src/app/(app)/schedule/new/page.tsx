import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHero } from '@/components/shell/page-hero';
import { NewPostClient } from '@/components/schedule/new-post-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New scheduled post — Persona Studio' };

export default async function NewSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { source, id } = await searchParams;

  const [videos, edits, accounts] = await Promise.all([
    prisma.videoGeneration.findMany({
      where: { userId: user.id, status: 'completed', videoUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, videoUrl: true, script: true, createdAt: true },
    }),
    prisma.videoEdit.findMany({
      where: { userId: user.id, status: 'completed', resultUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, resultUrl: true, template: true, createdAt: true },
    }),
    prisma.socialAccount.findMany({
      where: { userId: user.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, platform: true, displayName: true },
    }),
  ]);

  const sources = [
    ...edits.map((e) => ({
      sourceType: 'edit' as const,
      id: e.id,
      mediaUrl: e.resultUrl!,
      label: `Монтаж · ${e.template}`,
      createdAt: e.createdAt.toISOString(),
    })),
    ...videos.map((v) => ({
      sourceType: 'video' as const,
      id: v.id,
      mediaUrl: v.videoUrl!,
      label: v.script ? v.script.slice(0, 60) : 'Видео',
      createdAt: v.createdAt.toISOString(),
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="AUTOMATION · SCHEDULE · NEW"
        title={
          <>
            Запланировать <span className="italic text-gold">публикацию.</span>
          </>
        }
        description="Выберите готовое видео, напишите подпись, отметьте каналы и время — остальное сделает автопостинг."
        actions={[{ label: '← К расписанию', href: '/schedule', tone: 'ghost' }]}
      />

      {accounts.length === 0 ? (
        <div className="card p-8 text-center grid gap-3">
          <p className="font-serif italic text-[15px] text-text-secondary">
            Сначала подключите хотя бы один канал публикации.
          </p>
          <Link href="/schedule" className="btn-primary w-fit mx-auto">
            Подключить канал
          </Link>
        </div>
      ) : sources.length === 0 ? (
        <div className="card p-8 text-center grid gap-3">
          <p className="font-serif italic text-[15px] text-text-secondary">
            Нет готовых видео для публикации. Сгенерируйте видео или монтаж.
          </p>
          <Link href="/videos/new" className="btn-primary w-fit mx-auto">
            Создать видео
          </Link>
        </div>
      ) : (
        <NewPostClient
          sources={sources}
          accounts={accounts}
          preselect={source && id ? { sourceType: source, id } : null}
        />
      )}
    </div>
  );
}
