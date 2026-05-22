// Минимальный full-bleed layout для playground'а — без основного app-header'а.
// Header заменён на тонкую полоску с логотипом + кредитами + кнопкой "back".

import Link from "next/link";
import { auth } from "@/lib/auth";
import { getWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;
  const wallet = user?.id ? await getWallet(user.id) : null;

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-panel/30 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-muted hover:text-text flex items-center gap-2">
            <span className="text-base">←</span> Кабинет
          </Link>
          <span className="text-muted">/</span>
          <span className="font-semibold tracking-tight text-text">Playground</span>
          <div className="ml-auto flex items-center gap-3">
            {wallet && (
              <Link href="/wallet" className="panel px-3 py-1.5 text-sm">
                <span className="text-muted">Баланс:</span>{" "}
                <span className="font-medium text-accent">{wallet.available.toLocaleString()}</span>
              </Link>
            )}
            {user?.email && <span className="text-sm text-muted hidden md:inline">{user.email}</span>}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
