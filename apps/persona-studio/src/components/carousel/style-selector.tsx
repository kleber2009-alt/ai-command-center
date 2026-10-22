'use client';

import { Check } from 'lucide-react';
import { CAROUSEL_STYLES } from '@/lib/carousel/styles';

type Props = {
  value: string;
  onChange: (id: string) => void;
};

/**
 * Горизонтальный селектор стиля карусели. Каждый стиль — карточка с
 * мини-палитрой (3 swatch) и описанием. При смене стиля рендер карусели
 * пойдёт по другому шаблону (см. render-slide.ts → bg/typography).
 */
export function StyleSelector({ value, onChange }: Props) {
  const groups = [
    { key: 'skill', title: 'скиллы · стили рилсов', items: CAROUSEL_STYLES.filter((s) => s.group === 'skill') },
    { key: 'persona', title: 'Persona · 5 ДНК-стилей', items: CAROUSEL_STYLES.filter((s) => s.group === 'persona') },
  ];
  return (
    <div className="grid gap-4 rounded-[20px] border border-border-soft bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="label">
          стиль рендера · {CAROUSEL_STYLES.length}
        </span>
        <span className="hidden flex-1 border-b border-border-soft sm:block" />
        <span className="text-[12px] text-text-mute">
          применяется при «Сгенерировать PNG»
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.key} className="grid gap-2">
          <span className="text-[13px] font-medium text-text-dim">{g.title}</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
            {g.items.map((s) => {
              const active = s.id === value;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange(s.id)}
                  title={s.description}
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-gold bg-blue/[0.12] shadow-glow'
                      : 'border-border-soft bg-white/[0.03] hover:border-border-2 hover:bg-white/[0.06]'
                  }`}
                >
                  {s.group === 'skill' ? (
                    // превью обложка+пункт, отрендеренные тем же движком
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/skill-previews/${s.id.replace(/^skill-/, '')}.jpg`}
                      alt=""
                      className="h-[40px] w-auto shrink-0 rounded-lg border border-border-soft"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-border-soft">
                      {s.swatch.map((c, i) => (
                        <span key={i} className="block" style={{ background: c, width: 14, height: 36 }} />
                      ))}
                    </div>
                  )}
                  <div className="grid gap-0.5 min-w-0 flex-1">
                    <span className={`text-[14px] font-medium leading-tight ${active ? 'text-text' : 'text-text-dim'}`}>
                      {s.label}
                    </span>
                    <span className="truncate text-[11px] text-text-mute">{s.tag}</span>
                  </div>
                  {active && (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue text-white">
                      <Check size={12} strokeWidth={3} />
                      <span className="sr-only">выбран</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
