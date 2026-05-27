'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from './nav';

export function MobileMenu({
  groups,
  isAdmin,
  email,
  balance,
  signOutAction,
}: {
  groups: NavGroup[];
  isAdmin: boolean;
  email: string;
  balance: number;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Close menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer open
  useEffect(() => {
    if (!open) return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [open]);

  const isActive = (href: string) =>
    !!pathname && (pathname === href || pathname.startsWith(`${href}/`));

  const drawer =
    mounted && open
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100dvh',
              minHeight: '100vh',
              zIndex: 2147483646,
              background: 'rgba(0,0,0,0.88)',
              WebkitBackdropFilter: 'blur(8px)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: 'min(82vw, 340px)',
                height: '100%',
                background: '#0a0a0a',
                borderLeft: '1px solid #1a1a1a',
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                boxShadow: '-12px 0 40px rgba(0,0,0,0.6)',
                transform: 'translateZ(0)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="mono text-[11px] tracking-widest uppercase text-text-mute">Меню</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mono text-[16px] leading-none text-text-dim hover:text-text w-8 h-8 flex items-center justify-center border border-border"
                  aria-label="Закрыть меню"
                >
                  ✕
                </button>
              </div>

              <div className="grid gap-1.5">
                <span className="mono text-[9px] tracking-[0.22em] text-text-mute uppercase">balance</span>
                <span className="font-serif text-[28px] text-lime leading-none">{balance} tok</span>
                <span className="mono text-[10px] tracking-wider text-text-dim truncate">{email}</span>
              </div>

              <nav className="grid gap-5 mono text-[12px] tracking-[0.16em] uppercase">
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className={`py-2.5 px-3 border-l-2 transition-colors ${
                    isActive('/dashboard')
                      ? 'border-lime text-text bg-surface'
                      : 'border-transparent text-text-dim hover:text-text hover:bg-surface'
                  }`}
                >
                  Dashboard
                </Link>

                {groups.map((g) => (
                  <div key={g.key} className="grid gap-0.5">
                    <span className="mono text-[9px] tracking-[0.22em] uppercase text-lime px-3 mb-1">
                      {g.label}
                    </span>
                    {g.items.map((it) => {
                      const active = isActive(it.href);
                      return (
                        <Link
                          key={it.key}
                          href={it.href}
                          onClick={() => setOpen(false)}
                          className={`py-2.5 px-3 border-l-2 transition-colors ${
                            active
                              ? 'border-lime text-text bg-surface'
                              : 'border-transparent text-text-dim hover:text-text hover:bg-surface'
                          }`}
                        >
                          {it.label}
                        </Link>
                      );
                    })}
                  </div>
                ))}

                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className={`py-2.5 px-3 border-l-2 transition-colors ${
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
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden mono text-[11px] tracking-widest uppercase text-lime border border-lime/40 px-3 py-2 active:bg-lime/10"
        aria-label="Открыть меню"
        aria-expanded={open}
      >
        Меню
      </button>
      {drawer}
    </>
  );
}
