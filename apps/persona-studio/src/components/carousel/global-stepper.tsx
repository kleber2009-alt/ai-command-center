'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';

type StepStatus = 'done' | 'active' | 'pending';

type Step = {
  key: string;
  label: string;
  status: StepStatus;
  href?: string;
};

type Props = {
  steps: Step[];
};

/**
 * Горизонтальный stepper для флоу карусели: Парсер → Обложка → Слайды → Рендер.
 * Pixel-budget: 50–60px по высоте, всегда в верху страницы под top-bar'ом.
 */
export function GlobalStepper({ steps }: Props) {
  return (
    <div className="panel flex items-center gap-2 overflow-x-auto !rounded-full px-2 py-2 sm:gap-2.5">
      {steps.map((step, i) => {
        const styles = stylesFor(step.status);
        const content = (
          <span
            className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${styles}`}
          >
            <span className="text-[11px] tabular-nums opacity-70">{String(i + 1).padStart(2, '0')}</span>
            <span>{step.label}</span>
            {step.status === 'done' && <Check size={13} className="text-lime" />}
          </span>
        );
        return (
          <div key={step.key} className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            {step.href && step.status === 'done' ? (
              <Link href={step.href}>{content}</Link>
            ) : (
              content
            )}
            {i < steps.length - 1 && (
              <span className="w-4 border-t border-dashed border-border-2 sm:w-8" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

function stylesFor(status: StepStatus): string {
  if (status === 'active') return 'border-transparent bg-blue text-white shadow-glow';
  if (status === 'done') return 'border-lime/30 bg-lime/10 text-text hover:bg-lime/15';
  return 'border-border-soft bg-white/[0.03] text-text-mute';
}
