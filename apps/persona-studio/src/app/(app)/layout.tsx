import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { TopNav } from '@/components/nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  return (
    <>
      <TopNav email={user.email} balance={user.tokenBalance} isAdmin={user.role === 'admin'} />
      <main className="max-w-[1480px] mx-auto px-6 pb-24 pt-6">{children}</main>
    </>
  );
}
