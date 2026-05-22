import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { Header } from "@/components/Header";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin",              label: "Overview" },
  { href: "/admin/users",        label: "Users" },
  { href: "/admin/jobs",         label: "Jobs" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/tools",        label: "Tools" },
  { href: "/admin/payments",     label: "Payments" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="min-h-screen">
      <Header />
      <div className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          <span className="text-xs font-mono uppercase tracking-wider text-accent">Admin</span>
          <nav className="flex gap-4 text-sm">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className="text-muted hover:text-text">{t.label}</Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
