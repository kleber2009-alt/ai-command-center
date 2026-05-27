'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { SIDEBAR_SECTIONS, type SidebarItem } from './sidebar-nav';

type Props = {
  email: string;
  balance: number;
  isAdmin: boolean;
  plan?: string;
};

function isActive(pathname: string, item: SidebarItem): boolean {
  // pure-route matches; treat '/dashboard' as home root
  if (item.href === '/dashboard' && pathname === '/dashboard') return true;
  if (item.href === '/dashboard') return false;
  const base = item.href.split('#')[0];
  if (!base || base === '/dashboard') return false;
  return pathname === base || pathname.startsWith(base + '/');
}

export function Sidebar({ email, balance, isAdmin, plan = 'Pro' }: Props) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* mobile toggle — visible <lg */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle navigation"
        className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 flex items-center justify-center bg-bg-panel border border-border-soft text-text-primary"
      >
        <span className="mono text-[10px] tracking-[0.2em]">{open ? '×' : '≡'}</span>
      </button>

      {/* backdrop on mobile */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={[
          'fixed lg:sticky top-0 left-0 z-40 h-screen',
          'w-[264px] shrink-0',
          'bg-bg-panel border-r border-border-soft',
          'flex flex-col',
          'transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* brand */}
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="block px-6 pt-7 pb-6 border-b border-border-soft"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-[7px] h-[7px] rounded-full bg-gold" />
            <span className="font-serif text-[20px] tracking-tight text-text-primary">
              Persona <span className="italic text-gold">Studio</span>
            </span>
          </div>
          <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">
            Luxury AI Studio · v0.1
          </div>
        </Link>

        {/* nav body */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-5">
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.key}>
              {section.key !== 'home' && (
                <div className="px-3 mb-1.5 mono text-[9px] tracking-[0.28em] uppercase text-text-muted">
                  {section.label}
                </div>
              )}
              <ul className="space-y-px">
                {section.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={[
                          'group relative flex items-center gap-3 px-3 py-2',
                          'transition-colors duration-150',
                          active
                            ? 'text-text-primary'
                            : 'text-text-secondary hover:text-text-primary',
                        ].join(' ')}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gold" />
                        )}
                        <span
                          className={[
                            'inline-block w-1 h-1 rounded-full transition-colors',
                            active
                              ? 'bg-gold'
                              : 'bg-text-muted/40 group-hover:bg-text-secondary',
                          ].join(' ')}
                        />
                        <span className="text-[13px] tracking-tight">{item.label}</span>
                        {item.hint && (
                          <span className="ml-auto mono text-[8.5px] tracking-[0.18em] uppercase text-text-muted/70">
                            {item.hint}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {isAdmin && (
            <div>
              <div className="px-3 mb-1.5 mono text-[9px] tracking-[0.28em] uppercase text-pink">
                Admin
              </div>
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className={[
                  'flex items-center gap-3 px-3 py-2',
                  pathname.startsWith('/admin')
                    ? 'text-pink'
                    : 'text-text-secondary hover:text-pink',
                ].join(' ')}
              >
                <span className="inline-block w-1 h-1 rounded-full bg-pink" />
                <span className="text-[13px] tracking-tight">Console</span>
              </Link>
            </div>
          )}
        </nav>

        {/* footer: tokens + plan + user */}
        <div className="border-t border-border-soft px-4 py-4 space-y-3 text-[12px]">
          <Link
            href="/billing"
            className="flex items-baseline justify-between hover:opacity-90"
          >
            <span className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">
              Tokens
            </span>
            <span className="font-serif text-[22px] text-gold leading-none">
              {balance}
            </span>
          </Link>
          <Link
            href="/billing"
            className="flex items-baseline justify-between hover:opacity-90"
          >
            <span className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">
              Plan
            </span>
            <span className="mono text-[11px] tracking-[0.16em] uppercase text-text-primary">
              {plan}
            </span>
          </Link>
          <div className="pt-3 border-t border-border-soft flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold/40 to-pink/30 flex items-center justify-center font-serif text-[14px] text-text-primary">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-serif text-[13px] text-text-primary truncate">
                {email.split('@')[0]}
              </div>
              <div className="mono text-[8.5px] tracking-[0.22em] uppercase text-text-muted">
                {isAdmin ? 'Admin' : 'Creator'}
              </div>
            </div>
          </div>
          <Link
            href="/billing"
            className="block mono text-[9px] tracking-[0.22em] uppercase text-text-muted hover:text-gold transition-colors"
          >
            Help & Docs →
          </Link>
        </div>
      </aside>
    </>
  );
}
