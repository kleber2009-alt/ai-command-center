'use client';

import { Check } from 'lucide-react';

type Step = {
  key: string;
  label: string;
  done: boolean;
};

type Props = {
  steps: Step[];
  activeKey: string;
  onJump: (key: string) => void;
};

/**
 * Горизонтальный stepper: ✓ done · ● active · ○ pending.
 * Назад — кликом на любой пройденный шаг. Вперёд — только через выбор
 * в карточках (родитель решает, когда шаг переходит в done).
 */
export function EditsStepper({ steps, activeKey, onJump }: Props) {
  return (
    <nav aria-label="Шаги" className="flex items-center gap-1 overflow-x-auto sm:gap-2">
      {steps.map((step, idx) => {
        const isActive = step.key === activeKey;
        const isDone = step.done;
        const isPending = !isActive && !isDone;
        const clickable = isDone || isActive;
        return (
          <div key={step.key} className="flex items-center gap-1 sm:gap-2 min-w-0">
            <button
              type="button"
              onClick={() => clickable && onJump(step.key)}
              disabled={!clickable}
              className={`flex items-center gap-2 rounded-full border px-2 py-1.5 pr-3.5 transition-colors ${
                isActive
                  ? 'border-gold/50 bg-blue/[0.12] text-text'
                  : isDone
                    ? 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07] hover:text-text'
                    : 'cursor-not-allowed border-transparent text-text-mute'
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                  isActive
                    ? 'bg-blue text-white'
                    : isDone
                      ? 'bg-lime text-bg'
                      : 'border border-border-2 text-text-mute'
                }`}
              >
                {isDone ? <Check size={13} strokeWidth={3} /> : idx + 1}
              </span>
              <span className={`whitespace-nowrap text-[13px] ${isActive ? 'font-semibold' : ''}`}>
                {step.label}
              </span>
            </button>
            {idx < steps.length - 1 && (
              <span
                className={`min-w-[12px] flex-1 border-t border-dashed sm:min-w-[24px] ${
                  isDone ? 'border-lime/50' : 'border-border-2'
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
