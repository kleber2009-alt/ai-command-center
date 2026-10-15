'use client';

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
    { key: 'persona', title: 'persona · 5 DNA', items: CAROUSEL_STYLES.filter((s) => s.group === 'persona') },
  ];
  return (
    <div className="border border-border bg-surface px-3 py-2.5 grid gap-3">
      <div className="flex items-baseline gap-3">
        <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">
          стиль рендера · {CAROUSEL_STYLES.length}
        </span>
        <span className="flex-1 border-b border-border translate-y-[-3px]" />
        <span className="mono text-[9px] tracking-wider text-text-mute">
          применяется при «Сгенерировать PNG»
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.key} className="grid gap-2">
          <span className="mono text-[9px] tracking-[0.18em] uppercase text-text-dim">{g.title}</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
            {g.items.map((s) => {
              const active = s.id === value;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange(s.id)}
                  title={s.description}
                  className={`text-left border px-3 py-2.5 transition flex items-center gap-3 ${
                    active ? 'border-lime bg-lime/[0.05]' : 'border-border hover:border-text-dim'
                  }`}
                >
                  {s.group === 'skill' ? (
                    // превью обложка+пункт, отрендеренные тем же движком
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/skill-previews/${s.id.replace(/^skill-/, '')}.jpg`}
                      alt=""
                      className="shrink-0 border border-border h-[40px] w-auto"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex shrink-0 border border-border overflow-hidden">
                      {s.swatch.map((c, i) => (
                        <span key={i} className="block" style={{ background: c, width: 14, height: 36 }} />
                      ))}
                    </div>
                  )}
                  <div className="grid gap-0.5 min-w-0 flex-1">
                    <span className={`font-serif text-[14px] leading-tight ${active ? 'text-text' : 'text-text-dim'}`}>
                      {s.label}
                    </span>
                    <span className="mono text-[9px] tracking-wider text-text-mute uppercase truncate">{s.tag}</span>
                  </div>
                  {active && (
                    <span className="mono text-[9px] tracking-widest uppercase text-lime shrink-0">active</span>
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
