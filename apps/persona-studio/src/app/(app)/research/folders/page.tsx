import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FoldersClient } from '@/components/research/folders-client';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Папки — Persona Studio' };

export default async function FoldersIndex() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const folders = await prisma.researchFolder.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="LIBRARY · FOLDERS"
        title={
          <>
            Папки и проекты — <span className="italic text-gold">блогеры, видео, идеи.</span>
          </>
        }
        description="Сохраняй найденных конкурентов в папку «Блогеры», залётные ролики — в «Видео», action-пункты из рекомендаций — в «Идеи». Каждая папка живёт сама по себе и не теряется между поисками."
      />
      <FoldersClient
        initialFolders={folders.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type as 'bloggers' | 'videos' | 'ideas',
          itemCount: f._count.items,
          createdAt: f.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
