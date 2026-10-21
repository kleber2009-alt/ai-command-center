'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { SIDEBAR_SECTIONS, type SidebarItem } from './sidebar-nav';
import { t, type Locale } from '@/lib/i18n';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Icon3D } from '@/components/ui/icon3d';

type Props = {
  email: string;
  balance: number;
  isAdmin: boolean;
  plan?: string;
  hiddenKeys?: string[];
  locale: Locale;
};

function isActive(pathname: string, item: SidebarItem): boolean {
  if (item.href === '/dashboard') return pathname === '/dashboard';
  const base = item.href.split('#')[0];
  if (!base) return false;
  return pathname === base || pathname.startsWith(base + '/');
}

/** Most specific match wins (e.g. /schedule/new over /schedule). */
function activeKey(pathname: string, items: SidebarItem[]): string | null {
  let best: SidebarItem | null = null;
  for (const it of items) {
    if (isActive(pathname, it) && (!best || it.href.length > best.href.length)) best = it;
  }
  return best?.key ?? null;
}

export function Sidebar({ email, balance, isAdmin, plan = 'free', hiddenKeys = [], locale }: Props) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);

  const hidden = new Set(hiddenKeys);
  const visibleSections = SIDEBAR_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => !hidden.has(i.key)) }))
    .filter((s) => s.items.length > 0);
  const current = activeKey(pathname, visibleSections.flatMap((s) => s.items));
  const close = () => setOpen(false);

  return (
    <>
      {/* mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('Toggle navigation', locale)}
        aria-expanded={open}
        className="lg:hidden fixed top-3 left-3 z-50 btn-icon !w-11 !h-11 !bg-bg-panel/90"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm fade-in" onClick={close} />
      )}

      <aside
        className={[
          'fixed lg:sticky top-0 left-0 z-40 h-screen w-[272px] shrink-0 flex flex-col',
          'bg-[rgba(16,16,20,0.82)] backdrop-blur-2xl border-r border-border-soft',
          'transition-transform duration-500 ease-settle',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* brand */}
        <Link href="/dashboard" onClick={close} className="flex items-center gap-3 px-5 pt-6 pb-5 group">
          <Icon3D name="sparkles" size={26} tile="purple" />
          <div className="min-w-0">
            <div className="text-[17px] font-semibold tracking-[-0.02em] lowercase leading-tight">
              persona <span className="text-gold">studio</span>
            </div>
            <div className="text-[11px] text-text-mute">{t('AI content studio', locale)}</div>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {visibleSections.map((section) => (
            <div key={section.key}>
              {section.key !== 'home' && (
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-mute">
                  {t(section.label, locale)}
                </div>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = current === item.key;
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={close}
                        aria-current={active ? 'page' : undefined}
                        title={item.hint ? t(item.hint, locale) : undefined}
                        className={[
                          'group relative flex items-center gap-3 rounded-2xl px-2.5 py-[7px]',
                          'transition-[background,color,box-shadow] duration-200',
                          active
                            ? 'bg-blue/[0.16] text-white shadow-[inset_0_0_0_1px_rgba(59,140,255,0.35)]'
                            : 'text-text-dim hover:bg-white/[0.05] hover:text-white',
                        ].join(' ')}
                      >
                        <Icon3D name={item.icon} size={22} />
                        <span className="text-[14px] font-medium tracking-[-0.01em] truncate">{t(item.label, locale)}</span>
                        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_10px_2px_rgba(59,140,255,0.6)]" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {isAdmin && (
            <div>
              <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pink">
                {t('Admin', locale)}
              </div>
              <Link
                href="/admin"
                onClick={close}
                className={[
                  'flex items-center gap-3 rounded-2xl px-2.5 py-[7px] transition-colors',
                  pathname.startsWith('/admin') ? 'bg-pink/15 text-white' : 'text-text-dim hover:bg-white/[0.05] hover:text-white',
                ].join(' ')}
              >
                <Icon3D name="gear" size={22} />
                <span className="text-[14px] font-medium">{t('Console', locale)}</span>
              </Link>
            </div>
          )}
        </nav>

        {/* footer: balance card + user */}
        <div className="p-3 space-y-3 border-t border-border-soft">
          <Link
            href="/billing"
            onClick={close}
            className="card-editorial flex items-center gap-3 !rounded-2xl px-3 py-3"
          >
            <Icon3D name="coin" size={26} sway />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-text-mute">{t('Tokens', locale)}</div>
              <div className="text-[20px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{balance}</div>
            </div>
            <span className="rounded-full bg-blue px-3 py-1.5 text-[12px] font-semibold text-white">
              {t('Top up', locale)}
            </span>
          </Link>
          <div className="flex items-center gap-3 px-1">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue to-pink flex items-center justify-center text-[14px] font-semibold text-white">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium truncate">{email.split('@')[0]}</div>
              <div className="text-[11px] text-text-mute">
                {isAdmin ? t('Admin', locale) : t('Creator', locale)} · {t('plan', locale)} {plan}
              </div>
            </div>
            <LocaleSwitcher locale={locale} />
          </div>
        </div>
      </aside>
    </>
  );
}
