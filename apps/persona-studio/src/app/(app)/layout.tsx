import { redirect } from 'next/navigation';
import { getCurrentUser, signOut } from '@/lib/auth';
import { Sidebar } from '@/components/shell/sidebar';
import { TopActionBar } from '@/components/shell/top-action-bar';
import { AIDirectorBar } from '@/components/shell/ai-director-bar';
import { getHiddenSidebarKeys } from '@/lib/sidebar-overrides';
import { getLocale } from '@/lib/i18n';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const [hiddenSidebarKeys, locale] = await Promise.all([
    getHiddenSidebarKeys(),
    getLocale(),
  ]);

  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/sign-in' });
  }

  return (
    <div className="app-shell">
      <Sidebar
        email={user.email}
        balance={user.tokenBalance}
        isAdmin={user.role === 'admin'}
        plan={user.plan ?? 'Pro'}
        hiddenKeys={hiddenSidebarKeys}
        locale={locale}
      />

      <div className="shell-main">
        <TopActionBar signOutAction={doSignOut} locale={locale} />

        <main className="flex-1 px-4 sm:px-8 lg:px-10 pt-6 pb-2">
          <div className="max-w-[1480px] mx-auto">
            {children}
          </div>
        </main>

        <AIDirectorBar locale={locale} />
      </div>
    </div>
  );
}
