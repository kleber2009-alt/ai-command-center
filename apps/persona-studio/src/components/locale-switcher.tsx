'use client';

import { useTransition } from 'react';
import { setLocaleAction } from '@/lib/i18n-actions';
import type { Locale } from '@/lib/i18n';

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const [pending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === locale || pending) return;
    startTransition(() => {
      void setLocaleAction(next);
    });
  }

  const base =
    'mono text-[10px] tracking-[0.22em] uppercase px-1.5 py-0.5 transition-colors';
  const active = 'text-gold';
  const idle = 'text-text-muted hover:text-text-primary';

  return (
    <div
      className="flex items-center gap-1 select-none"
      aria-label="Language switcher"
      title="Language"
    >
      <button
        type="button"
        onClick={() => pick('ru')}
        disabled={pending}
        className={`${base} ${locale === 'ru' ? active : idle}`}
        aria-pressed={locale === 'ru'}
      >
        RU
      </button>
      <span className="mono text-[9px] text-text-muted/60">·</span>
      <button
        type="button"
        onClick={() => pick('en')}
        disabled={pending}
        className={`${base} ${locale === 'en' ? active : idle}`}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  );
}
