import Link from 'next/link';
import { LayoutDashboard, BookOpen, Newspaper, Users, MailCheck } from 'lucide-react';
import { currentAdmin } from '@/lib/admin-auth';
import { AdminLogin } from './AdminLogin';

const NAV = [
  { href: '/admin', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/admin/content', label: 'Контент курса', icon: BookOpen },
  { href: '/admin/posts', label: 'Лента сообщества', icon: Newspaper },
  { href: '/admin/users', label: 'Пользователи', icon: Users },
  { href: '/admin/leads', label: 'Лиды', icon: MailCheck },
];

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Gate the whole panel behind an admin session (spec 6).
  if (!currentAdmin()) {
    return <AdminLogin />;
  }

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <aside className="w-60 shrink-0 border-r border-neutral-200 bg-white p-4">
        <div className="mb-6 px-2 text-lg font-semibold">Club Der Denker</div>
        <nav className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-neutral-100"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
