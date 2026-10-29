'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LogOut, Plus, Search } from 'lucide-react';
import { QUICK_CREATE_ACTIONS } from './sidebar-nav';
import { t, type Locale } from '@/lib/i18n';
import { Icon3D } from '@/components/ui/icon3d';

type Props = {
  signOutAction: () => Promise<void> | void;
  locale: Locale;
};

export function TopActionBar({ signOutAction, locale }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setCreateOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCreateOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [createOpen]);

  // Search = viral research by niche (the research page reads ?niche=).
  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/research?niche=${encodeURIComponent(q)}`);
  }

  return (
    <div className="sticky top-0 z-30 border-b border-border-soft bg-[rgba(11,11,13,0.72)] backdrop-blur-2xl">
      <div className="flex items-center gap-3 px-4 py-3 pl-16 sm:px-8 lg:px-10 lg:pl-10">
        <form onSubmit={onSearch} className="flex-1 max-w-xl" role="search">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-mute" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search viral content by niche…', locale)}
              aria-label={t('Search viral content by niche…', locale)}
              className="input !rounded-full !pl-11 !py-2.5"
            />
          </label>
        </form>

        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            aria-expanded={createOpen}
            aria-haspopup="menu"
            className="btn-primary"
          >
            <Plus size={16} strokeWidth={2.5} className={`transition-transform duration-300 ${createOpen ? 'rotate-45' : ''}`} />
            <span className="hidden sm:inline">{t('Create Content', locale)}</span>
          </button>

          {createOpen && (
            <div
              role="menu"
              className="panel shadow-glass absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-2rem)] p-2 z-50 !bg-[rgba(22,22,27,0.92)] reveal"
            >
              <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-mute">
                {t('Quick create', locale)}
              </div>
              <ul className="stagger">
                {QUICK_CREATE_ACTIONS.map((action) => (
                  <li key={action.label}>
                    <Link
                      href={action.href}
                      role="menuitem"
                      onClick={() => setCreateOpen(false)}
                      className="group flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-white/[0.06]"
                    >
                      <Icon3D name={action.icon} size={24} tile />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold">{t(action.label, locale)}</div>
                        <div className="text-[12px] text-text-mute truncate">{t(action.hint, locale)}</div>
                      </div>
                      <ArrowRight size={16} className="text-text-mute transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form action={signOutAction} className="hidden sm:block">
          <button className="btn-icon" type="submit" title={t('Sign out', locale)} aria-label={t('Sign out', locale)}>
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
