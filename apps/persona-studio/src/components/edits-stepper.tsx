'use client';

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
    <nav aria-label="Progress" className="flex items-center gap-1 sm:gap-2">
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
              className={`flex items-center gap-2 px-2.5 py-1.5 transition-colors ${
                isActive
                  ? 'text-lime'
                  : isDone
                    ? 'text-text-dim hover:text-text'
                    : 'text-text-mute cursor-not-allowed'
              }`}
            >
              <span
                className={`mono text-[9px] tracking-widest uppercase font-bold w-5 h-5 inline-flex items-center justify-center border ${
                  isActive
                    ? 'border-lime bg-lime text-bg'
                    : isDone
                      ? 'border-text-dim text-text-dim'
                      : 'border-border text-text-mute'
                }`}
              >
                {isDone ? '✓' : idx + 1}
              </span>
              <span className={`mono text-[10px] sm:text-[11px] tracking-widest uppercase whitespace-nowrap ${isActive ? 'font-bold' : ''}`}>
                {step.label}
              </span>
            </button>
            {idx < steps.length - 1 && (
              <span
                className={`flex-1 min-w-[12px] sm:min-w-[24px] border-t ${
                  isDone ? 'border-text-dim' : 'border-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
