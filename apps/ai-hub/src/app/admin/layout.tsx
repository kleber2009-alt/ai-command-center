import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin",              label: "Overview" },
  { href: "/admin/users",        label: "Users" },
  { href: "/admin/jobs",         label: "Jobs" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/tools",        label: "Tools" },
  { href: "/admin/payments",     label: "Payments" },
  { href: "/admin/showcase",     label: "Showcase" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <div className="border-b border-border bg-bg/40 backdrop-blur-2xl">
          <div className="px-6 md:px-8 py-3 flex items-center gap-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Admin</span>
            <nav className="flex gap-1 text-sm">
              {TABS.map((t) => (
                <Link key={t.href} href={t.href}
                      className="px-3 py-1.5 rounded-lg text-muted hover:text-text hover:bg-white/5 transition">
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <main className="flex-1 px-6 md:px-8 py-6 pb-24 md:pb-6 max-w-[1400px] w-full">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
