import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ResearchClient } from '@/components/research/research-client';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ресёрч — Persona Studio' };

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string }>;
}) {
  const { niche } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  return (
    <div className="grid gap-8">
      <PageHero
        icon="research"
        eyebrow="ресёрч вирусного контента"
        title={
          <>
            Что залетело <span className="italic text-gold">в твоей нише</span> прямо сейчас.
          </>
        }
        description="Вписываешь нишу — получаешь ленту реальных Instagram-рилсов с просмотрами, виральностью × и вовлечённостью. Метрики считаются относительно медианы автора, поэтому 50× — это реальный выброс, а не толстый канал."
      />

      <ResearchClient isFreePlan={user.plan === 'free'} initialNiche={niche?.slice(0, 120)} />
    </div>
  );
}
