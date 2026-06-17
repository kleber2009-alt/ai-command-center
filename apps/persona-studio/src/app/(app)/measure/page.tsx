import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getMeasureDashboard } from '@/lib/measure/measure';
import { MeasureClient } from '@/components/measure/measure-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Аналитика — Persona Studio' };

export default async function MeasurePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const dashboard = await getMeasureDashboard(user.id);
  return <MeasureClient initial={dashboard} />;
}
