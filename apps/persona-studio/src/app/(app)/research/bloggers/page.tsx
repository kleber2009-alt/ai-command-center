import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { BloggersClient } from '@/components/research/bloggers-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Блогеры — Persona Studio' };

export default async function BloggersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  return <BloggersClient />;
}
