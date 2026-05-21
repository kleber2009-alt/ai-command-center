// Floating topbar that hovers above the workspace. Breadcrumbs on the left,
// token pill + profile on the right. Sticky with backdrop blur.

import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { getWallet } from "@/lib/wallet";
import { CmdKTrigger } from "./CmdKTrigger";

export async function Topbar() {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; name?: string; image?: string | null; role?: string } | undefined;
  const wallet = user?.id ? await getWallet(user.id) : null;
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-bg/40 backdrop-blur-2xl border-b border-border">
      <div className="px-6 py-3 flex items-center gap-4">
        {/* Mobile brand (visible when sidebar hides) */}
        <Link href="/dashboard" className="md:hidden font-display font-semibold tracking-tight">
          AI Creative Hub
        </Link>

        <div className="ml-auto flex items-center gap-2.5">
          {wallet && (
            <Link href="/wallet"
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-border hover:border-accent/40 transition">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(123,97,255,0.8)]" />
              <span className="text-sm font-medium tabular-nums">{wallet.available.toLocaleString()}</span>
              <span className="text-xs text-muted">токенов</span>
              {wallet.reserved > 0 && (
                <span className="text-xs text-accent">+{wallet.reserved}</span>
              )}
            </Link>
          )}

          <CmdKTrigger />
          <Link href="/wallet" className="hidden sm:inline-flex pill hover:border-accent/40 transition">
            <span>＋ Top up</span>
          </Link>

          {user && (
            <div className="relative group">
              <button className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-white/[0.04] border border-border hover:border-accent/40 transition">
                <span className="w-7 h-7 rounded-full bg-accent-grad grid place-items-center text-[11px] font-semibold text-white">
                  {initials}
                </span>
                <span className="hidden sm:inline text-xs text-muted max-w-[120px] truncate">
                  {user.email}
                </span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-56 panel p-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition">
                <div className="px-3 py-2 text-xs text-muted truncate">{user.email}</div>
                <Link href="/wallet" className="block px-3 py-2 rounded-lg text-sm hover:bg-white/5">Billing</Link>
                {user.role === "admin" && (
                  <Link href="/admin/users" className="block px-3 py-2 rounded-lg text-sm hover:bg-white/5 text-accent">Admin</Link>
                )}
                <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
                  <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted hover:bg-white/5 hover:text-text">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
