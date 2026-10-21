import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';
import { Kinetic } from '@/components/ui/kinetic';

type Action = { label: string; href: string; tone?: 'primary' | 'ghost' };

type Props = {
  /** small chip above the headline, e.g. "CREATE · 01 · AVATAR" */
  eyebrow: string;
  /** headline — words rise one by one (lowercase per the UI-моушн skill) */
  title: string | ReactNode;
  description?: string | ReactNode;
  /** optional right-side metadata block */
  meta?: ReactNode;
  actions?: Action[];
  /** optional content below the description (stats, status pills) */
  extra?: ReactNode;
  /** 3D icon floating in the corner */
  icon?: Icon3DName;
};

export function PageHero({ eyebrow, title, description, meta, actions, extra, icon }: Props) {
  return (
    <section className="panel relative mb-8 overflow-hidden !rounded-[28px]">
      <div className="hero-gradient pointer-events-none absolute inset-0" />
      {icon && (
        <div className="pointer-events-none absolute -right-2 -top-2 hidden md:block opacity-95 pop-in">
          <Icon3D name={icon} size={132} sway />
        </div>
      )}
      <div className="relative grid items-end gap-6 p-6 md:p-9 lg:grid-cols-[1fr_auto] lg:p-11">
        <div className="max-w-[66ch]">
          <div className="eyebrow mb-5 reveal">
            <span className="h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_8px_2px_rgba(59,140,255,0.6)]" />
            {eyebrow}
          </div>
          <h1 className="display-2 mb-4">
            <Kinetic delay={1}>{title}</Kinetic>
          </h1>
          {description && (
            <p className="reveal text-[16px] leading-[1.6] text-text-dim" style={{ ['--i' as string]: 3 } as React.CSSProperties}>
              {description}
            </p>
          )}
          {actions && actions.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-3 reveal" style={{ ['--i' as string]: 4 } as React.CSSProperties}>
              {actions.map((a) => (
                <Link key={a.href + a.label} href={a.href} className={a.tone === 'ghost' ? 'btn-ghost' : 'btn-primary'}>
                  {a.label}
                </Link>
              ))}
            </div>
          )}
          {extra && <div className="mt-7 reveal" style={{ ['--i' as string]: 5 } as React.CSSProperties}>{extra}</div>}
        </div>
        {meta && <div className="space-y-1 self-start text-right lg:self-end">{meta}</div>}
      </div>
    </section>
  );
}
