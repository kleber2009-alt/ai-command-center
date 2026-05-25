'use client';

import type { BrollMode } from '@vp/shared';

const OPTIONS: { mode: BrollMode; label: string; hint: string }[] = [
  { mode: 'auto_stock', label: 'Auto Stock', hint: 'Pexels + Pixabay' },
  { mode: 'my_library', label: 'My Library', hint: 'только своя медиатека' },
  { mode: 'hybrid', label: 'Hybrid', hint: 'своя + добор из стоков' },
];

/** Three-pill B-roll mode switcher (§4.0, §8.2). */
export function BrollModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: BrollMode;
  onChange: (mode: BrollMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((o) => {
        const active = o.mode === value;
        return (
          <button
            key={o.mode}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.mode)}
            className={`flex flex-col items-start rounded-lg border px-4 py-2 text-left transition ${
              active
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/50'
            }`}
          >
            <span className="text-sm font-medium">{o.label}</span>
            <span className="text-xs text-muted">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
