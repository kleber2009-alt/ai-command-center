import Link from 'next/link';
import { signOut } from '@/lib/auth';
import { MobileMenu } from './mobile-menu';

type Props = {
  email: string;
  balance: number;
  isAdmin?: boolean;
};

export type NavItem = { href: string; label: string; key: string; hint?: string };
export type NavGroup = { label: string; key: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Создать',
    key: 'create',
    items: [
      { href: '/generate', label: 'Generate', key: 'generate', hint: '1 фото → 10 аватаров' },
      { href: '/voice', label: 'Voice', key: 'voice', hint: 'обучение голоса' },
    ],
  },
  {
    label: 'Контент',
    key: 'content',
    items: [
      { href: '/avatars', label: 'Avatars', key: 'avatars', hint: 'все батчи' },
      { href: '/covers', label: 'Covers', key: 'covers', hint: 'обложки карусели' },
      { href: '/carousels', label: 'Carousels', key: 'carousels', hint: 'слайды' },
      { href: '/videos', label: 'Videos', key: 'videos', hint: 'talking-photo' },
      { href: '/edits', label: 'Montage', key: 'edits', hint: 'Submagic-монтаж' },
    ],
  },
  {
    label: 'Источники',
    key: 'sources',
    items: [
      { href: '/parser', label: 'Parser', key: 'parser', hint: 'IG-конкуренты' },
    ],
  },
  {
    label: 'Аккаунт',
    key: 'account',
    items: [
      { href: '/billing', label: 'Billing', key: 'billing', hint: 'токены и история' },
      { href: '/settings/keys', label: 'API keys', key: 'keys', hint: 'SDK-доступ' },
    ],
  },
];

export function TopNav({ email, balance, isAdmin }: Props) {
  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/sign-in' });
  }

  return (
    <header className="sticky top-0 z-40 bg-[rgba(8,8,8,0.88)] backdrop-blur border-b border-border">
      <div className="max-w-[1480px] mx-auto px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 py-3 sm:py-3.5">
        <div className="flex items-baseline gap-3 min-w-0 shrink">
          <Link
            href="/dashboard"
            className="flex items-baseline gap-2 sm:gap-2.5 mono text-[10px] sm:text-[12px] tracking-widest font-bold uppercase whitespace-nowrap"
          >
            <span className="inline-block w-[7px] h-[7px] rounded-full bg-lime translate-y-[-1px] shrink-0" />
            <span className="hidden sm:inline">Persona Studio</span>
            <span className="sm:hidden">PS</span>
          </Link>
          <span className="hidden sm:inline mono text-[10px] tracking-[0.18em] text-text-mute">v0.1</span>
        </div>

        <nav className="hidden md:flex items-center gap-1 mono text-[11px] tracking-[0.16em] uppercase">
          <Link
            href="/dashboard"
            className="px-3 py-2 text-text-dim hover:text-text transition-colors"
          >
            Dashboard
          </Link>
          {NAV_GROUPS.map((g) => (
            <GroupDropdown key={g.key} group={g} />
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className="px-3 py-2 text-pink hover:text-text transition-colors"
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Token balance — visible on every screen */}
          <Link href="/billing" className="flex flex-col items-end leading-tight hover:opacity-80">
            <span className="mono text-[8px] sm:text-[9px] tracking-[0.18em] sm:tracking-[0.22em] text-text-mute uppercase">tokens</span>
            <span className="font-serif text-[16px] sm:text-[20px] text-lime">{balance}</span>
          </Link>

          {/* Desktop sign-out */}
          <form action={doSignOut} className="hidden md:block">
            <button className="btn-ghost" type="submit" title={email}>
              Sign out
            </button>
          </form>

          {/* Mobile drawer trigger */}
          <MobileMenu
            groups={NAV_GROUPS}
            isAdmin={Boolean(isAdmin)}
            email={email}
            balance={balance}
            signOutAction={doSignOut}
          />
        </div>
      </div>
    </header>
  );
}

// Pure-CSS dropdown: opens on hover (group) and on keyboard focus (focus-within).
// Avoids a client component for navigation — keeps initial render fast.
function GroupDropdown({ group }: { group: NavGroup }) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="menu"
        className="px-3 py-2 inline-flex items-center gap-1.5 text-text-dim group-hover:text-text focus-visible:text-text transition-colors"
      >
        <span>{group.label}</span>
        <span className="mono text-[8px] tracking-widest text-text-mute group-hover:text-text-dim transition-transform group-hover:rotate-180">
          ▾
        </span>
      </button>
      <div
        role="menu"
        className="
          absolute top-full left-0 min-w-[240px] mt-0
          hidden group-hover:block group-focus-within:block
          border border-border bg-[#0a0a0a] shadow-[0_12px_40px_rgba(0,0,0,0.6)]
          z-50
        "
      >
        <div className="px-4 py-3 border-b border-border">
          <span className="mono text-[9px] tracking-[0.22em] uppercase text-lime">{group.label}</span>
        </div>
        <div className="py-1">
          {group.items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              role="menuitem"
              className="block px-4 py-2.5 hover:bg-surface transition-colors"
            >
              <div className="mono text-[11px] tracking-[0.16em] uppercase text-text">{it.label}</div>
              {it.hint && (
                <div className="font-serif italic text-[12px] text-text-mute mt-0.5">{it.hint}</div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
