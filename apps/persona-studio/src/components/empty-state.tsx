import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';

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
  'empty': 'пока пусто',
  'need-avatar': 'нужен аватар',
  'need-video': 'нужно видео',
  'need-config': 'нужна настройка',
};

const KIND_ICON: Record<Kind, Icon3DName> = {
  'empty': 'sparkles',
  'need-avatar': 'avatar',
  'need-video': 'video',
  'need-config': 'gear',
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
      <p className="flex flex-wrap items-center gap-2 text-[14px] text-text-dim">
        <span className="eyebrow !py-0.5 !text-[11px]">{KIND_LABEL[kind]}</span>
        {title}
        {cta && (
          <Link href={cta.href} className="inline-flex items-center gap-1 font-medium text-gold hover:underline">
            {cta.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </p>
    );
  }

  return (
    <div className="panel reveal max-w-[640px] px-6 py-8 sm:px-8 sm:py-10">
      <div className="mb-5 flex items-center gap-3">
        <Icon3D name={KIND_ICON[kind]} size={30} tile sway />
        <span className="eyebrow">{KIND_LABEL[kind]}</span>
      </div>
      <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">{title}</h3>
      {description && (
        <p className="mt-3 max-w-[60ch] text-[14px] text-text-dim sm:text-[15px]">{description}</p>
      )}
      {(cta || secondaryCta) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {cta && (
            <Link href={cta.href} className="btn-primary">
              {cta.label}
              <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </Link>
          )}
          {secondaryCta && (
            <Link href={secondaryCta.href} className="btn-ghost">
              {secondaryCta.label}
              <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
