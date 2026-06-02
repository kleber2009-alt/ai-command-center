// Страница автора (ТЗ §7 Модуль 3). Серверный компонент: ищет автора по
// username, если нет — индексирует (бесплатно — это первый просмотр),
// рендерит профиль + грид рилсов + блок page-analysis.

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { indexAuthor } from '@/lib/research/index-author';
import { AuthorClient } from '@/components/research/author-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Анализ страницы — Persona Studio' };

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { username: raw } = await params;
  const username = decodeURIComponent(raw).replace(/^@/, '').toLowerCase();

  let author = await prisma.researchAuthor.findUnique({
    where: { platform_username: { platform: 'instagram', username } },
    include: {
      reels: { orderBy: { postedAt: 'desc' }, take: 30 },
      pageAnalyses: {
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Если автора нет — индексируем on-demand (бесплатно, первый просмотр)
  if (!author) {
    const result = await indexAuthor(username);
    if (!result.authorId) notFound();
    author = await prisma.researchAuthor.findUnique({
      where: { id: result.authorId },
      include: {
        reels: { orderBy: { postedAt: 'desc' }, take: 30 },
        pageAnalyses: {
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }
  if (!author) notFound();

  const watching = await prisma.researchWatchlist.findUnique({
    where: { userId_authorId: { userId: user.id, authorId: author.id } },
  });

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/research"
          className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text"
        >
          ← Назад к выдаче
        </Link>
      </div>

      <AuthorClient
        author={{
          id: author.id,
          username: author.username,
          followers: author.followers,
          postsCount: author.postsCount,
          avatarUrl: author.avatarUrl,
          profileUrl: author.profileUrl,
          medianViews: author.medianViews,
          engagementAvg: author.engagementAvg,
          lowConfidence: author.lowConfidence,
          lastIndexedAt: author.lastIndexedAt?.toISOString() ?? null,
          isWatching: Boolean(watching),
        }}
        reels={author.reels.map((r) => ({
          id: r.id,
          url: r.url,
          thumbnailUrl: r.thumbnailUrl,
          caption: r.caption,
          views: r.views,
          likes: r.likes,
          comments: r.comments,
          virality: r.virality,
          engagementRate: r.engagementRate,
          postedAt: r.postedAt?.toISOString() ?? null,
        }))}
        analysis={
          author.pageAnalyses[0]
            ? {
                ...author.pageAnalyses[0],
                createdAt: author.pageAnalyses[0].createdAt.toISOString(),
              }
            : null
        }
      />
    </div>
  );
}
