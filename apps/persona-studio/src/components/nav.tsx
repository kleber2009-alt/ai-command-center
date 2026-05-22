import Link from 'next/link';
import { signOut } from '@/lib/auth';

type Props = {
  email: string;
  balance: number;
  isAdmin?: boolean;
};

const ITEMS: Array<{ href: string; label: string; key: string }> = [
  { href: '/dashboard', label: 'Dashboard', key: 'dashboard' },
  { href: '/generate', label: 'Generate', key: 'generate' },
  { href: '/avatars', label: 'Avatars', key: 'avatars' },
  { href: '/voice', label: 'Voice', key: 'voice' },
  { href: '/videos', label: 'Videos', key: 'videos' },
  { href: '/covers', label: 'Covers', key: 'covers' },
  { href: '/billing', label: 'Billing', key: 'billing' },
  { href: '/settings/keys', label: 'API keys', key: 'keys' },
];

export function TopNav({ email, balance, isAdmin }: Props) {
  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/sign-in' });
  }

  return (
    <header className="sticky top-0 z-40 bg-[rgba(8,8,8,0.88)] backdrop-blur border-b border-border">
      <div className="max-w-[1480px] mx-auto px-6 flex items-center justify-between py-3.5">
        <div className="flex items-baseline gap-3">
          <Link href="/dashboard" className="flex items-baseline gap-2.5 mono text-[12px] tracking-widest font-bold uppercase">
            <span className="inline-block w-[7px] h-[7px] rounded-full bg-lime translate-y-[-1px]" />
            Persona Studio
          </Link>
          <span className="mono text-[10px] tracking-[0.18em] text-text-mute">v0.1</span>
        </div>

        <nav className="hidden md:flex items-center gap-7 mono text-[11px] tracking-[0.16em] uppercase">
          {ITEMS.map((it) => (
            <Link key={it.key} href={it.href} className="text-text-dim hover:text-text transition-colors">
              {it.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" className="text-pink hover:text-text transition-colors">
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="mono text-[9px] tracking-[0.22em] text-text-mute uppercase">tokens</span>
            <span className="font-serif text-[20px] text-lime">{balance}</span>
          </div>
          <form action={doSignOut}>
            <button className="btn-ghost" type="submit" title={email}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
