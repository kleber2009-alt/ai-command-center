import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findPipeline, pipelineView } from '@/lib/pipeline/server';
import { pipelineCosts } from '@/lib/pipeline/costs';
import { ReelPipeline } from '@/components/pipeline/reel-pipeline';
import { CarouselPipeline } from '@/components/pipeline/carousel-pipeline';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ветка — Persona Studio' };

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { id } = await params;

  const row = await findPipeline(user.id, id);
  if (!row) notFound();
  const pipeline = await pipelineView(row);

  if (pipeline.kind === 'carousel') return <CarouselPipeline pipeline={pipeline} />;

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id, status: 'active' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, platform: true, displayName: true },
  });
  return <ReelPipeline initial={pipeline} costs={pipelineCosts()} accounts={accounts} />;
}
