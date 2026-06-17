import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { computeTrends, listNicheTags } from '@/lib/research/trends';
import { TrendsClient } from '@/components/research/trends-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Тренды — Persona Studio' };

export default async function TrendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const now = Date.now();
  const [trends, niches] = await Promise.all([
    computeTrends({ niche: 'all', windowDays: 7, now }),
    listNicheTags({ now }),
  ]);

  return <TrendsClient initialTrends={trends} niches={niches} />;
}
