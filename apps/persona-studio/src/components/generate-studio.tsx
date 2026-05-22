'use client';

import { useMemo, useState } from 'react';
import { UploadZone } from '@/components/upload-zone';
import { AVATAR_STYLES } from '@/lib/styles';
import { NICHES } from '@/lib/niches';

type Mode = 'default' | 'niche' | 'custom';

type InitialUpload = {
  id: string;
  url: string;
  type: string;
  bytes: number;
  createdAt?: string;
};

const SLOTS = 10;

export function GenerateStudio({ initialUploads }: { initialUploads: InitialUpload[] }) {
  const [mode, setMode] = useState<Mode>('default');
  const [nicheSlug, setNicheSlug] = useState<string>(NICHES[0]?.slug ?? '');
  const [customText, setCustomText] = useState<string>('');

  const selectedNiche = useMemo(
    () => NICHES.find((n) => n.slug === nicheSlug) ?? NICHES[0],
    [nicheSlug],
  );

  const customPrompts = useMemo(
    () =>
      customText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4)
        .slice(0, SLOTS),
    [customText],
  );

  const extraBody = useMemo<Record<string, unknown>>(() => {
    if (mode === 'niche') return { mode: 'niche', nicheSlug: selectedNiche.slug };
    if (mode === 'custom') return { mode: 'custom', customPrompts };
    return { mode: 'default' };
  }, [mode, selectedNiche.slug, customPrompts]);

  const generateLabel =
    mode === 'custom'
      ? `Generate ${SLOTS} avatars · custom →`
      : mode === 'niche'
      ? `Generate ${SLOTS} avatars · ${selectedNiche.label} →`
      : `Generate ${SLOTS} avatars →`;

  const costHint =
    mode === 'custom' && customPrompts.length === 0
      ? 'Введи хотя бы один промпт (мин. 4 символа)'
      : 'Спишется 10 токенов · ~3-5 мин на Flux Kontext Pro';

  return (
    <div className="grid gap-10">
      <UploadZone
        initialUploads={initialUploads}
        extraBody={extraBody}
        generateLabel={generateLabel}
        costHint={costHint}
      />

      {/* MODE SWITCHER */}
      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Что сгенерировать</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
            mode: {mode}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-[2px] bg-border border border-border">
          <ModeBtn active={mode === 'default'} onClick={() => setMode('default')}
            label="Default 10" sub="фирменные режиссёрские стили" />
          <ModeBtn active={mode === 'niche'} onClick={() => setMode('niche')}
            label="По нише" sub="20 ниш × 10 паков" />
          <ModeBtn active={mode === 'custom'} onClick={() => setMode('custom')}
            label="Свой промпт" sub="до 10 строк, твой текст" />
        </div>
      </section>

      {/* DEFAULT — 10 fixed styles */}
      {mode === 'default' && (
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="sec-num">/02</span>
            <span className="sec-title">Default · 10 styles</span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
            <span className="mono text-[10px] tracking-widest uppercase text-text-mute">10 styles</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px] bg-border border border-border">
            {AVATAR_STYLES.map((s, i) => (
              <div key={s.slug} className="bg-surface px-5 py-4 grid grid-cols-[56px_1fr] gap-4 items-center">
                <span className="mono text-[20px] font-bold text-text-faint">
                  {(i + 1).toString().padStart(2, '0')}
                </span>
                <div>
                  <div className="font-serif italic text-[19px] leading-tight">{s.label}</div>
                  <div className="mono text-[10px] tracking-widest uppercase text-text-mute mt-1">
                    {s.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* NICHE — 20 niches × 10 packs */}
      {mode === 'niche' && (
        <section className="grid gap-6">
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="sec-num">/02</span>
              <span className="sec-title">Выбери нишу</span>
              <span className="flex-1 border-b border-border translate-y-[-3px]" />
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                {NICHES.length} ниш
              </span>
            </div>
            <div className="flex flex-wrap gap-[2px] bg-border border border-border">
              {NICHES.map((n) => {
                const active = n.slug === selectedNiche.slug;
                return (
                  <button
                    key={n.slug}
                    type="button"
                    onClick={() => setNicheSlug(n.slug)}
                    className={`px-3 py-2 text-left transition-colors ${
                      active ? 'bg-lime text-[#0a1a00]' : 'bg-surface hover:bg-surface-2 text-text-main'
                    }`}
                  >
                    <div className="mono text-[10px] tracking-widest uppercase font-bold leading-tight">
                      {n.label}
                    </div>
                    <div className={`mono text-[9px] tracking-wider mt-0.5 ${
                      active ? 'text-[#0a1a00]/70' : 'text-text-mute'
                    }`}>
                      {n.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="sec-num">/03</span>
              <span className="sec-title">{selectedNiche.label} · 10 паков</span>
              <span className="flex-1 border-b border-border translate-y-[-3px]" />
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                10 prompts
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px] bg-border border border-border">
              {selectedNiche.prompts.map((p, i) => (
                <div key={p.slug} className="bg-surface px-5 py-4 grid grid-cols-[56px_1fr] gap-4 items-start">
                  <span className="mono text-[20px] font-bold text-text-faint">
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <div>
                    <div className="font-serif italic text-[19px] leading-tight">{p.label}</div>
                    <div className="mono text-[10px] tracking-widest uppercase text-text-mute mt-1">
                      {p.description}
                    </div>
                    <div className="text-[12px] text-text-dim mt-2 leading-snug">
                      {p.promptStyle}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CUSTOM — user prompts */}
      {mode === 'custom' && (
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="sec-num">/02</span>
            <span className="sec-title">Свой промпт</span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
            <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
              {customPrompts.length} / {SLOTS}
            </span>
          </div>
          <p className="font-serif text-[15px] text-text-dim mb-3 max-w-[70ch]">
            Опиши на английском <span className="italic">wardrobe + setting + lighting</span> (одна строка = один аватар).
            До {SLOTS} строк. Если меньше — циклически дублируем, чтобы заполнить пачку.
            Identity-блок добавим автоматически — твоё лицо сохранится.
          </p>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={10}
            placeholder={`wearing a navy linen suit, on a sunlit mediterranean terrace, warm golden afternoon light, refined editorial mood.
wearing a black turtleneck, against a deep charcoal backdrop with single rim light, chiaroscuro portrait mood.
...`}
            className="w-full bg-surface border border-border p-4 mono text-[13px] leading-relaxed text-text-main focus:outline-none focus:border-lime"
          />
          {customPrompts.length > 0 && (
            <div className="mt-3 mono text-[10px] tracking-widest uppercase text-text-mute">
              valid lines: {customPrompts.length} · 1..{SLOTS}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-4 text-left transition-colors ${
        active ? 'bg-lime text-[#0a1a00]' : 'bg-surface hover:bg-surface-2 text-text-main'
      }`}
    >
      <div className="font-serif italic text-[20px] leading-tight">{label}</div>
      <div
        className={`mono text-[10px] tracking-widest uppercase mt-1 ${
          active ? 'text-[#0a1a00]/70' : 'text-text-mute'
        }`}
      >
        {sub}
      </div>
    </button>
  );
}
