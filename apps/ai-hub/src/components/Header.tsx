import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { getWallet } from "@/lib/wallet";

export async function Header() {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string } | undefined;
  const wallet = user?.id ? await getWallet(user.id) : null;

  return (
    <header className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
        <Link href="/dashboard" className="font-semibold tracking-tight">AI Creative Hub</Link>
        <nav className="flex gap-4 text-sm text-muted">
          <Link href="/dashboard" className="hover:text-text">Главная</Link>
          <Link href="/tools" className="hover:text-text">Инструменты</Link>
          <Link href="/gallery" className="hover:text-text">Галерея</Link>
          <Link href="/history" className="hover:text-text">История</Link>
          <Link href="/play/carousel" className="hover:text-text">Карусель</Link>
          <Link href="/wallet" className="hover:text-text">Баланс</Link>
          {user?.role === "admin" && (
            <Link href="/admin" className="text-accent hover:opacity-80">Admin</Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {wallet && (
            <Link href="/wallet" className="panel px-3 py-1.5 text-sm">
              <span className="text-muted">Токены:</span>{" "}
              <span className="font-medium">{wallet.available.toLocaleString()}</span>
              {wallet.reserved > 0 && (
                <span className="text-muted"> (+{wallet.reserved} в работе)</span>
              )}
            </Link>
          )}
          {user?.email && <span className="text-sm text-muted">{user.email}</span>}
          {user && (
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <button type="submit" className="text-sm text-muted hover:text-text">Выйти</button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
