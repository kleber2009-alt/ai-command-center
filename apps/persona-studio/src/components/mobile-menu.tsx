'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { href: string; label: string; key: string };

export function MobileMenu({
  items,
  isAdmin,
  email,
  balance,
  signOutAction,
}: {
  items: Item[];
  isAdmin: boolean;
  email: string;
  balance: number;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden mono text-[11px] tracking-widest uppercase text-lime border border-lime/40 px-3 py-1.5"
        aria-label="Open menu"
      >
        Меню
      </button>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-[rgba(0,0,0,0.85)] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-bg border-l border-border absolute right-0 top-0 bottom-0 w-[80vw] max-w-[320px] p-6 flex flex-col gap-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="mono text-[11px] tracking-widest uppercase text-text-mute">Меню</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mono text-[12px] text-text-dim hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-1.5">
              <span className="mono text-[9px] tracking-[0.22em] text-text-mute uppercase">balance</span>
              <span className="font-serif text-[28px] text-lime leading-none">{balance} tok</span>
              <span className="mono text-[10px] tracking-wider text-text-dim truncate">{email}</span>
            </div>

            <nav className="grid gap-1 mono text-[12px] tracking-[0.16em] uppercase">
              {items.map((it) => {
                const active = !!pathname && (pathname === it.href || pathname.startsWith(`${it.href}/`));
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    className={`py-3 px-3 border-l-2 transition-colors ${
                      active
                        ? 'border-lime text-text bg-surface'
                        : 'border-transparent text-text-dim hover:text-text hover:bg-surface'
                    }`}
                  >
                    {it.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`py-3 px-3 border-l-2 transition-colors ${
                    pathname?.startsWith('/admin')
                      ? 'border-pink text-text bg-surface'
                      : 'border-transparent text-pink hover:bg-surface'
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>

            <form action={signOutAction} className="mt-auto pt-6 border-t border-border">
              <button type="submit" className="btn-ghost w-full justify-center">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
