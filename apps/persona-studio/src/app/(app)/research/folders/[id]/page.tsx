import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FolderDetailClient } from '@/components/research/folder-detail-client';

export const dynamic = 'force-dynamic';

export default async function FolderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { id } = await params;

  const folder = await prisma.researchFolder.findFirst({
    where: { id, userId: user.id },
  });
  if (!folder) notFound();

  const items = await prisma.researchFolderItem.findMany({
    where: { folderId: folder.id },
    orderBy: { createdAt: 'desc' },
  });

  // Развернём привязанные сущности
  const reelIds = items.filter((i) => i.itemType === 'reel').map((i) => i.itemId);
  const authorIds = items.filter((i) => i.itemType === 'author').map((i) => i.itemId);

  const [reels, authors] = await Promise.all([
    reelIds.length
      ? prisma.researchReel.findMany({
          where: { id: { in: reelIds } },
          include: { author: true },
        })
      : Promise.resolve([]),
    authorIds.length
      ? prisma.researchAuthor.findMany({ where: { id: { in: authorIds } } })
      : Promise.resolve([]),
  ]);

  const reelById = new Map(reels.map((r) => [r.id, r]));
  const authorById = new Map(authors.map((a) => [a.id, a]));

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/research/folders"
          className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text"
        >
          ← Все папки
        </Link>
      </div>
      <FolderDetailClient
        folder={{ id: folder.id, name: folder.name, type: folder.type as 'bloggers' | 'videos' | 'ideas' }}
        items={items.map((it) => {
          const reel = it.itemType === 'reel' ? reelById.get(it.itemId) : null;
          const author = it.itemType === 'author' ? authorById.get(it.itemId) : null;
          return {
            id: it.id,
            itemType: it.itemType as 'reel' | 'author' | 'idea',
            itemId: it.itemId,
            note: it.note,
            createdAt: it.createdAt.toISOString(),
            reel: reel
              ? {
                  id: reel.id,
                  url: reel.url,
                  thumbnailUrl: reel.thumbnailUrl,
                  caption: reel.caption,
                  views: reel.views,
                  virality: reel.virality,
                  engagementRate: reel.engagementRate,
                  author: { username: reel.author.username, avatarUrl: reel.author.avatarUrl },
                }
              : null,
            author: author
              ? {
                  id: author.id,
                  username: author.username,
                  avatarUrl: author.avatarUrl,
                  followers: author.followers,
                  medianViews: author.medianViews,
                }
              : null,
          };
        })}
      />
    </div>
  );
}
