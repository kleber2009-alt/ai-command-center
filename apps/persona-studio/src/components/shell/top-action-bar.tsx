'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QUICK_CREATE_ACTIONS } from './sidebar-nav';

type Props = {
  signOutAction: () => Promise<void> | void;
};

export function TopActionBar({ signOutAction }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [createOpen]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    // light-weight routing: pass query to /parser as search context until a dedicated search endpoint lands
    router.push(`/parser?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="sticky top-0 z-30 bg-bg-main/85 backdrop-blur border-b border-border-soft">
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-8 lg:px-10 py-3.5 pl-16 lg:pl-10">
        <form onSubmit={onSearch} className="flex-1 max-w-xl">
          <label className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 mono text-[10px] tracking-[0.22em] text-text-muted">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anything…"
              className="w-full bg-transparent border-0 border-b border-border-soft focus:border-gold/60 outline-none py-2 pl-7 pr-3 font-sans text-[14px] text-text-primary placeholder:text-text-muted/70 transition-colors"
            />
          </label>
        </form>

        <button
          type="button"
          aria-label="Notifications"
          className="btn-icon"
          title="Notifications"
        >
          <span className="mono text-[12px]">◔</span>
        </button>

        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="btn-primary"
          >
            <span className="text-[14px] leading-none">+</span>
            <span>Create Content</span>
          </button>

          {createOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-[320px] panel shadow-editorial p-2 z-50"
            >
              <div className="px-3 py-2 mono text-[9px] tracking-[0.28em] uppercase text-text-muted border-b border-border-soft mb-1">
                Quick create
              </div>
              <ul>
                {QUICK_CREATE_ACTIONS.map((action) => (
                  <li key={action.label}>
                    <Link
                      href={action.href}
                      onClick={() => setCreateOpen(false)}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-bg-card transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="font-serif text-[15px] text-text-primary group-hover:text-gold transition-colors">
                          {action.label}
                        </div>
                        <div className="mono text-[9px] tracking-[0.2em] uppercase text-text-muted">
                          {action.hint}
                        </div>
                      </div>
                      <span
                        className={[
                          'mono text-[12px] transition-transform group-hover:translate-x-0.5',
                          action.accent === 'gold' ? 'text-gold' :
                          action.accent === 'lime' ? 'text-lime' :
                          action.accent === 'cyan' ? 'text-cyan' : 'text-pink',
                        ].join(' ')}
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form action={signOutAction} className="hidden sm:block">
          <button className="btn-icon" type="submit" title="Sign out">
            <span className="mono text-[10px]">⤓</span>
          </button>
        </form>
      </div>
    </div>
  );
}
