import Link from 'next/link';
import type { ReactNode } from 'react';

type Action = { label: string; href: string; tone?: 'primary' | 'ghost' };

type Props = {
  /** Mono eyebrow, e.g. "PERSONA · 01" */
  eyebrow: string;
  /** Big serif headline */
  title: string | ReactNode;
  /** Italic serif paragraph below the headline */
  description?: string | ReactNode;
  /** Optional right-side metadata block */
  meta?: ReactNode;
  /** Optional CTA buttons */
  actions?: Action[];
  /** Optional content rendered below description (e.g. quick stats / status pills) */
  extra?: ReactNode;
};

export function PageHero({ eyebrow, title, description, meta, actions, extra }: Props) {
  return (
    <section className="relative border border-border-soft bg-bg-panel mb-10 overflow-hidden">
      <div className="absolute inset-0 hero-gradient opacity-70 pointer-events-none" />
      <div className="relative grid lg:grid-cols-[1fr_auto] items-end gap-6 p-6 md:p-9 lg:p-12">
        <div className="max-w-[64ch]">
          <div className="eyebrow mb-5">
            <span className="text-gold">◆</span> {eyebrow}
          </div>
          <h1 className="display-2 mb-4">{title}</h1>
          {description && (
            <p className="font-serif italic text-[17px] leading-[1.55] text-text-secondary">
              {description}
            </p>
          )}
          {actions && actions.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-3">
              {actions.map((a) => (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className={a.tone === 'ghost' ? 'btn-ghost' : 'btn-primary'}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          )}
          {extra && <div className="mt-7">{extra}</div>}
        </div>
        {meta && (
          <div className="text-right space-y-1 self-start lg:self-end">
            {meta}
          </div>
        )}
      </div>
    </section>
  );
}
