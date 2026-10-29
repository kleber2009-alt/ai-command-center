import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pipelineView } from '@/lib/pipeline/server';
import { PageHero } from '@/components/shell/page-hero';
import { PipelineList } from '@/components/pipeline/pipeline-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Мои ветки — Persona Studio' };

export default async function PipelinesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const rows = await prisma.pipeline.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const pipelines = await Promise.all(rows.map((r) => pipelineView(r)));

  return (
    <div className="grid gap-2">
      <PageHero
        eyebrow="мой блог · ветки"
        title="мои ветки"
        description="Каждый уникализированный пост из «Моего блога» — отдельная ветка: рилс идёт через сценарий, аватар, видео и монтаж к публикации, карусель — через ремикс слайдов."
        icon="workspace"
        actions={[{ label: 'Выбрать пост в «Моём блоге»', href: '/blog' }]}
      />
      <PipelineList pipelines={pipelines} />
    </div>
  );
}
