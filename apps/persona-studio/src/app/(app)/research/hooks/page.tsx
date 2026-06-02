import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { HooksClient } from '@/components/research/hooks-client';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Хуки — Persona Studio' };

export default async function HooksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="HOOK GALLERY · MILLIONS-OF-VIEWS"
        title={
          <>
            Хуки, на которых <span className="italic text-gold">залетают рилсы.</span>
          </>
        }
        description="Каждый хук вытащен из проанализированного вирусного ролика — с метрикой «набрал N просмотров». Сортируй по формуле, ищи по нише, сохраняй свои шаблоны."
      />
      <HooksClient />
    </div>
  );
}
