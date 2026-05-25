'use client';

import Link from 'next/link';

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
    <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto py-3 px-3 sm:px-0 border-b border-border">
      {steps.map((step, i) => {
        const styles = stylesFor(step.status);
        const content = (
          <span
            className={`flex items-center gap-2 px-2.5 py-1.5 border ${styles} mono text-[10px] tracking-[0.16em] uppercase whitespace-nowrap`}
          >
            <span className="opacity-70">{String(i + 1).padStart(2, '0')}</span>
            <span>{step.label}</span>
            {step.status === 'done' && <span className="text-lime">✓</span>}
          </span>
        );
        return (
          <div key={step.key} className="flex items-center gap-2 sm:gap-3 shrink-0">
            {step.href && step.status === 'done' ? (
              <Link href={step.href}>{content}</Link>
            ) : (
              content
            )}
            {i < steps.length - 1 && (
              <span className="w-4 sm:w-8 border-t border-border" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

function stylesFor(status: StepStatus): string {
  if (status === 'active') return 'border-lime text-lime bg-lime/[0.06]';
  if (status === 'done') return 'border-lime/40 text-text-dim';
  return 'border-border text-text-mute';
}
