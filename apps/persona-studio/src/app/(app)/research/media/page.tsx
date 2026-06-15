import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { MediaClient } from '@/components/research/media-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Медиа — Persona Studio' };

export default async function MediaPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  return <MediaClient />;
}
