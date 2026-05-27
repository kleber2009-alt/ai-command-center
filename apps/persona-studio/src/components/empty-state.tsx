import Link from 'next/link';
import type { ReactNode } from 'react';

type Kind = 'empty' | 'need-avatar' | 'need-video' | 'need-config';

type Cta = { href: string; label: string };

type Props = {
  kind?: Kind;
  title: string;
  description?: ReactNode;
  cta?: Cta;
  secondaryCta?: Cta;
  size?: 'sm' | 'md';
};

const KIND_LABEL: Record<Kind, string> = {
  'empty': '/ EMPTY',
  'need-avatar': '/ NEED AVATAR',
  'need-video': '/ NEED VIDEO',
  'need-config': '/ NEED CONFIG',
};

const KIND_TONE: Record<Kind, string> = {
  'empty': 'text-text-mute',
  'need-avatar': 'text-cyan',
  'need-video': 'text-cyan',
  'need-config': 'text-warm',
};

export function EmptyState({
  kind = 'empty',
  title,
  description,
  cta,
  secondaryCta,
  size = 'md',
}: Props) {
  if (size === 'sm') {
    return (
      <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
        <span className={KIND_TONE[kind]}>{KIND_LABEL[kind]}</span> — {title}
        {cta && (
          <>
            {' '}
            <Link href={cta.href} className="text-lime">
              {cta.label} →
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="border border-border bg-surface px-6 sm:px-8 py-8 sm:py-10 max-w-[640px]">
      <div className={`mono text-[10px] tracking-widest uppercase mb-3 ${KIND_TONE[kind]}`}>
        {KIND_LABEL[kind]}
      </div>
      <h3 className="font-serif text-[22px] sm:text-[26px] leading-tight">{title}</h3>
      {description && (
        <p className="font-serif italic text-[14px] sm:text-[15px] text-text-dim mt-3 max-w-[60ch]">
          {description}
        </p>
      )}
      {(cta || secondaryCta) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {cta && (
            <Link href={cta.href} className="btn-primary">
              {cta.label} →
            </Link>
          )}
          {secondaryCta && (
            <Link href={secondaryCta.href} className="btn-ghost">
              {secondaryCta.label} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
